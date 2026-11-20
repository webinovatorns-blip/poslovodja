import type { Database } from "@/types/database";

import type { OrganizationState } from "./route-rules";

type MemberRole = Database["public"]["Enums"]["member_role"];
type MembershipStatus = Database["public"]["Enums"]["membership_status"];

/** Cookie holding the user's PREFERRED organization id. Never proof of access. */
export const ACTIVE_ORGANIZATION_COOKIE = "poslovodja_active_org";

export type OrganizationMembership = {
  organizationId: string;
  organizationName: string;
  role: MemberRole;
  status: MembershipStatus;
};

export type ActiveOrganizationResolution =
  | { state: "none"; organizations: OrganizationMembership[] }
  | { state: "needs-selection"; organizations: OrganizationMembership[] }
  | {
      state: "selected";
      organization: OrganizationMembership;
      organizations: OrganizationMembership[];
    };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * Picks the active organization from memberships loaded from the database
 * for the signed-in user. The preferred id (cookie/URL) is only a hint:
 * it's honored only if it matches one of the user's ACTIVE memberships.
 */
export function resolveActiveOrganization(
  memberships: OrganizationMembership[],
  preferredOrganizationId: string | null | undefined,
): ActiveOrganizationResolution {
  // Defense in depth: the query already filters, but never trust a
  // suspended/invited membership even if one slips through.
  const organizations = memberships
    .filter((membership) => membership.status === "active")
    .sort((a, b) => a.organizationName.localeCompare(b.organizationName, "sr-Latn"));

  if (organizations.length === 0) {
    return { state: "none", organizations };
  }

  if (isUuid(preferredOrganizationId)) {
    const preferred = organizations.find(
      (membership) => membership.organizationId === preferredOrganizationId.toLowerCase(),
    );
    if (preferred) {
      return { state: "selected", organization: preferred, organizations };
    }
  }

  if (organizations.length === 1) {
    return { state: "selected", organization: organizations[0], organizations };
  }

  return { state: "needs-selection", organizations };
}

export function organizationStateOf(
  resolution: ActiveOrganizationResolution,
): OrganizationState {
  return resolution.state;
}

const roleRank: Record<MemberRole, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  worker: 1,
};

/** True if `role` is one of `allowed`. */
export function hasRole(role: MemberRole, allowed: readonly MemberRole[]): boolean {
  return allowed.includes(role);
}

/** True if `role` is at least `minimum` (owner > admin > manager > worker). */
export function hasRoleAtLeast(role: MemberRole, minimum: MemberRole): boolean {
  return roleRank[role] >= roleRank[minimum];
}
