import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";

import { routes } from "@/config/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

import {
  ACTIVE_ORGANIZATION_COOKIE,
  hasRole,
  resolveActiveOrganization,
  type ActiveOrganizationResolution,
  type OrganizationMembership,
} from "./active-organization";
import { decidePostAuthDestination } from "./route-rules";

/**
 * Data Access Layer for authentication and the active organization.
 *
 * Every function re-checks on the server, per request:
 *   - the user comes from supabase.auth.getUser() (validated by Supabase Auth,
 *     not just decoded from the cookie);
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

/**
 * Result of reading the caller's memberships. `ok: false` means the read
 * itself failed (database/PostgREST error); it does NOT mean "no
 * memberships" and must never be treated as such.
 */
export type MembershipsReadResult =
  { ok: true; memberships: OrganizationMembership[] } | { ok: false };

/**
 * Thrown by the guards when memberships can't be read. Carries no upstream
 * error details. Pages render a retryable "temporarily unavailable" state
 * for it instead of sending the user to onboarding.
 */
export class MembershipsUnavailableError extends Error {
  constructor() {
    super("Memberships are temporarily unavailable.");
    this.name = "MembershipsUnavailableError";
  }
}

export function isMembershipsUnavailableError(
  error: unknown,
): error is MembershipsUnavailableError {
  return error instanceof MembershipsUnavailableError;
}

export type ActiveOrganizationContext = ActiveOrganizationResolution & {
  user: CurrentUser;
};

export type OrganizationContext = {
  user: CurrentUser;
  organization: OrganizationMembership;
  organizations: OrganizationMembership[];
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
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

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", data.user.id)
    .maybeSingle();

  return {
    id: data.user.id,
    email: data.user.email ?? "",
    fullName: profile?.full_name ?? null,
  };
});

/**
 * Active memberships of `userId`, loaded through RLS.
 * A failed read returns `{ ok: false }` (no error details), never `[]`.
 */
export async function listActiveMemberships(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<MembershipsReadResult> {
  const { data, error } = await supabase
    .from("memberships")
    .select("role, status, organization:organizations!inner(id, name)")
    .eq("user_id", userId)
    .eq("status", "active");

  if (error || !Array.isArray(data)) {
    // Never log or forward the upstream error: it may contain internals.
    return { ok: false };
  }

  return {
    ok: true,
    memberships: data
      // Defense in depth: never rely on the query filter alone.
      .filter((row) => row.status === "active")
      .map((row) => ({
        organizationId: row.organization.id,
        organizationName: row.organization.name,
        role: row.role,
        status: row.status,
      })),
  };
}

async function readPreferredOrganizationId(): Promise<string | null> {
  return (await cookies()).get(ACTIVE_ORGANIZATION_COOKIE)?.value ?? null;
}

const resolveForUser = cache(
  async (userId: string): Promise<ActiveOrganizationResolution> => {
    const supabase = await createSupabaseServerClient();
    const result = await listActiveMemberships(supabase, userId);
    if (!result.ok) {
      throw new MembershipsUnavailableError();
    }
    return resolveActiveOrganization(
      result.memberships,
      await readPreferredOrganizationId(),
    );
  },
);

/** The signed-in user, or a redirect to /login. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect(routes.login);
  }
  return user;
}

/**
 * Resolution of the active organization for the signed-in user.
 * Throws MembershipsUnavailableError when memberships can't be read.
 */
export async function getActiveOrganization(): Promise<ActiveOrganizationContext> {
  const user = await requireUser();
  const resolution = await resolveForUser(user.id);
  return { ...resolution, user };
}

/**
 * The verified active organization, or a redirect:
 * no organization → /onboarding; several and none chosen → /select-organization.
 * Throws MembershipsUnavailableError when memberships can't be read (never
 * redirects to /onboarding in that case).
 */
export async function requireOrganization(): Promise<OrganizationContext> {
  const resolution = await getActiveOrganization();

  if (resolution.state === "none") {
    redirect(routes.onboarding);
  }
  if (resolution.state === "needs-selection") {
    redirect(routes.selectOrganization);
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
    redirect(routes.dashboard);
  }
  return context;
}

/**
 * Destination for a user who just signed in (or visits /login while signed in).
 *
 * If memberships can't be read, the organization state is unknown: the user
 * is NOT sent to /onboarding. They go to the requested in-app page (or the
 * dashboard), whose server guard re-reads memberships and shows a retryable
 * "temporarily unavailable" state until the read succeeds.
 */
export async function resolvePostAuthPath(
  supabase: SupabaseServerClient,
  userId: string,
  next?: string | null,
): Promise<string> {
  const result = await listActiveMemberships(supabase, userId);
  if (!result.ok) {
    return decidePostAuthDestination("selected", next);
  }
  const resolution = resolveActiveOrganization(
    result.memberships,
    await readPreferredOrganizationId(),
  );
  return decidePostAuthDestination(resolution.state, next);
}
