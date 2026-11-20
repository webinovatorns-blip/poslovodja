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
import { MembershipsUnavailableError, isMembershipsUnavailableError } from "./errors";
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
    console.error("[auth] memberships_unavailable", {
      code: typeof error?.code === "string" ? error.code : "no_data",
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
    redirect(routes.login);
  }
  return user;
}

/** Resolution of the active organization for the signed-in user. */
export async function getActiveOrganization(): Promise<
  ActiveOrganizationResolution & { user: CurrentUser }
> {
  const user = await requireUser();
  const resolution = await resolveForUser(user.id);
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
