import "server-only";

import { isAuthRetryableFetchError, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { withBasePath } from "@/config/base-path";
import { routes } from "@/config/navigation";
import { withAuthDeadline } from "@/lib/supabase/request-timeout";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import {
  ACTIVE_ORGANIZATION_COOKIE,
  hasRole,
  resolveActiveOrganization,
  type ActiveOrganizationResolution,
  type OrganizationMembership,
} from "./active-organization";
import {
  AuthUnavailableError,
  MembershipsUnavailableError,
  isMembershipsUnavailableError,
} from "./errors";
import { decidePostAuthDestination } from "./route-rules";

/**
 * Data Access Layer for authentication and the active organization.
 *
 * Every function re-checks on the server, per request:
 *   - the user comes from supabase.auth.getUser() (validated by Supabase Auth,
 *     not just decoded from the cookie); if Auth can't be reached in time,
 *     AuthUnavailableError is thrown (fail closed, retryable);
 *   - memberships come from the database through RLS (only the caller's own
 *     ACTIVE memberships);
 *   - the active-organization cookie is only a preference.
 * React's cache() dedupes the work within a single request.
 */

type MemberRole = Database["public"]["Enums"]["member_role"];
type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string | null;
};

export type OrganizationContext = {
  user: CurrentUser;
  organization: OrganizationMembership;
  organizations: OrganizationMembership[];
};

export type AuthUserResult =
  | { status: "signed-in"; user: User }
  | { status: "signed-out" }
  /** Auth didn't answer in time / network error / 5xx: session state unknown. */
  | { status: "unavailable" };

/**
 * Runs a Supabase Auth call with the Auth deadline and tells "Auth couldn't
 * be reached" (deadline exceeded, timeout, network error, 5xx from the
 * gateway: AuthRetryableFetchError) apart from a real answer. A real answer
 * may still carry an error (invalid code, expired session …).
 */
export async function callAuth<T extends { error: unknown }>(
  call: Promise<T>,
): Promise<{ unavailable: true } | { unavailable: false; result: T }> {
  let result: T;
  try {
    result = await withAuthDeadline(call);
  } catch {
    // Deadline exceeded (already logged with a safe code).
    return { unavailable: true };
  }
  if (result.error && isAuthRetryableFetchError(result.error)) {
    // Safe log: HTTP status only (0 = timeout / network), never the message.
    console.error("[auth] auth_unavailable", { status: result.error.status });
    return { unavailable: true };
  }
  return { unavailable: false, result };
}

/**
 * supabase.auth.getUser() with a deadline, classified. Callers must fail
 * closed on "unavailable" (no access), but must not sign the user out
 * because of it: the outage is temporary and the session may be valid.
 */
export async function getAuthUser(
  supabase: SupabaseServerClient,
): Promise<AuthUserResult> {
  const call = await callAuth(supabase.auth.getUser());
  if (call.unavailable) {
    return { status: "unavailable" };
  }
  const { data, error } = call.result;
  if (error || !data.user) {
    return { status: "signed-out" };
  }
  return { status: "signed-in", user: data.user };
}

/**
 * The Auth-validated user of this request, or null when signed out.
 * Throws AuthUnavailableError (→ root error boundary with a retry) when Auth
 * can't be reached: never treated as signed in.
 */
const getAuthenticatedUser = cache(async (): Promise<User | null> => {
  // Auth is always request-time: never part of a prerendered/prefetched shell.
  // (The Supabase client also reads the clock to check token expiry.)
  await connection();

  let supabase: SupabaseServerClient;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    // Supabase not configured: treat as signed out (reported at startup).
    return null;
  }

  const result = await getAuthUser(supabase);
  if (result.status === "unavailable") {
    throw new AuthUnavailableError();
  }
  return result.status === "signed-in" ? result.user : null;
});

/** Display name from the profile; a failed read (incl. timeout) is not fatal. */
const loadProfileName = cache(async (userId: string): Promise<string | null> => {
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return profile?.full_name ?? null;
});

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: await loadProfileName(user.id),
  };
});

/**
 * Active memberships of `userId`, loaded through RLS.
 *
 * Returns `[]` ONLY when the query succeeded and found nothing. A failed
 * query throws MembershipsUnavailableError: callers must not mistake an
 * outage for "no organizations" (that would send the user to onboarding).
 */
export async function listActiveMemberships(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<OrganizationMembership[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("role, status, organization:organizations!inner(id, name)")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error || !data) {
    // Safe log: a stable code and context only, never the message, user id,
    // tokens or cookies.
    // A timeout / network failure has no PostgREST code (status 0).
    console.error("[auth] memberships_unavailable", {
      code: !error ? "no_data" : error.code ? error.code : "request_failed",
    });
    throw new MembershipsUnavailableError();
  }

  return (
    data
      // Defense in depth: never rely on the query filter alone.
      .filter((row) => row.status === "active")
      .map((row) => ({
        organizationId: row.organization.id,
        organizationName: row.organization.name,
        role: row.role,
        status: row.status,
      }))
  );
}

async function readPreferredOrganizationId(): Promise<string | null> {
  return (await cookies()).get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;
}

const resolveForUser = cache(
  async (userId: string): Promise<ActiveOrganizationResolution> => {
    const supabase = await createSupabaseServerClient();
    const memberships = await listActiveMemberships(supabase, userId);
    return resolveActiveOrganization(memberships, await readPreferredOrganizationId());
  },
);

/** The signed-in user, or a redirect to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(withBasePath(routes.login));
  }
  return user;
}

/** Resolution of the active organization for the signed-in user. */
export async function getActiveOrganization(): Promise<
  ActiveOrganizationResolution & { user: CurrentUser }
> {
  const authUser = await getAuthenticatedUser();
  if (!authUser) {
    redirect(withBasePath(routes.login));
  }
  // Profile and memberships in parallel: when the Data API is down, the
  // page fails after one request timeout instead of two.
  const [user, resolution] = await Promise.all([
    requireUser(),
    resolveForUser(authUser.id),
  ]);
  return { ...resolution, user };
}

/**
 * The verified active organization, or a redirect:
 * no organization → /onboarding; several and none chosen → /select-organization.
 * If memberships can't be read, MembershipsUnavailableError propagates to the
 * root error boundary (src/app/error.tsx), which offers a retry.
 */
export async function requireOrganization(): Promise<OrganizationContext> {
  const resolution = await getActiveOrganization();

  if (resolution.state === "none") {
    redirect(withBasePath(routes.onboarding));
  }
  if (resolution.state === "needs-selection") {
    redirect(withBasePath(routes.selectOrganization));
  }

  return {
    user: resolution.user,
    organization: resolution.organization,
    organizations: resolution.organizations,
  };
}

/**
 * Like requireOrganization(), but also requires one of `roles` in the active
 * organization. Users without the role are sent to the dashboard.
 * The database (RLS) enforces the same rules independently.
 */
export async function requireOrganizationRole(
  roles: readonly MemberRole[],
): Promise<OrganizationContext> {
  const context = await requireOrganization();
  if (!hasRole(context.organization.role, roles)) {
    redirect(withBasePath(routes.dashboard));
  }
  return context;
}

/** Destination for a user who just signed in (or visits /login while signed in). */
export async function resolvePostAuthPath(
  supabase: SupabaseServerClient,
  userId: string,
  next?: string | null,
): Promise<string> {
  try {
    const memberships = await listActiveMemberships(supabase, userId);
    const resolution = resolveActiveOrganization(
      memberships,
      await readPreferredOrganizationId(),
    );
    return decidePostAuthDestination(resolution.state, next);
  } catch (error) {
    if (isMembershipsUnavailableError(error)) {
      return decidePostAuthDestination("unavailable", next);
    }
    throw error;
  }
}
