import { routes } from "@/config/navigation";

import { safeRedirectPath } from "./redirects";

/**
 * Pure routing rules shared by the proxy (optimistic, HTTP redirects) and
 * the server guards (authoritative, during render). No I/O here.
 */

/** Pages that require a signed-in user. */
const protectedPrefixes = [
  routes.onboarding,
  routes.selectOrganization,
  routes.dashboard,
  routes.clients,
  routes.jobs,
  routes.quotes,
  routes.finances,
  routes.team,
  routes.settings,
] as const;

/** Pages a signed-in user should not see (they get sent into the app). */
const guestOnlyPaths = [routes.login, routes.register] as const;

function matches(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isProtectedPath(pathname: string): boolean {
  return protectedPrefixes.some((prefix) => matches(pathname, prefix));
}

export function isGuestOnlyPath(pathname: string): boolean {
  return guestOnlyPaths.some((path) => matches(pathname, path));
}

export type RouteDecision = { type: "next" } | { type: "redirect"; location: string };

/**
 * Proxy decision, based only on "is there a valid session?".
 * Organization checks happen on the server in /auth/continue and the guards.
 */
export function decideProxyRoute(input: {
  pathname: string;
  search: string;
  isAuthenticated: boolean;
}): RouteDecision {
  const { pathname, search, isAuthenticated } = input;

  if (!isAuthenticated && isProtectedPath(pathname)) {
    const next = safeRedirectPath(`${pathname}${search}`, routes.dashboard);
    return {
      type: "redirect",
      location: `${routes.login}?next=${encodeURIComponent(next)}`,
    };
  }

  if (isAuthenticated && isGuestOnlyPath(pathname)) {
    const params = new URLSearchParams(search);
    const next = params.get("next");
    const query = next ? `?next=${encodeURIComponent(safeRedirectPath(next))}` : "";
    return { type: "redirect", location: `${routes.authContinue}${query}` };
  }

  return { type: "next" };
}

export type OrganizationState = "none" | "needs-selection" | "selected";

/**
 * Where a signed-in user goes after login, email confirmation, password
 * reset or when visiting /login while signed in.
 */
export function decidePostAuthDestination(
  state: OrganizationState,
  next?: string | null,
): string {
  if (state === "none") {
    return routes.onboarding;
  }

  const target = safeRedirectPath(next, routes.dashboard);
  const targetPath = target.split(/[?#]/)[0];
  const isOrgSetupPage =
    targetPath === routes.onboarding || targetPath === routes.selectOrganization;
  const isGuestPage = isGuestOnlyPath(targetPath);

  if (state === "needs-selection") {
    const after = isOrgSetupPage || isGuestPage ? routes.dashboard : target;
    return `${routes.selectOrganization}?next=${encodeURIComponent(after)}`;
  }

  return isOrgSetupPage || isGuestPage ? routes.dashboard : target;
}
