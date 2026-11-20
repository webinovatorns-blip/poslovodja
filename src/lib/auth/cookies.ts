import "server-only";

import { cookies } from "next/headers";

import { ACTIVE_ORGANIZATION_COOKIE } from "./active-organization";

/** Stores the preferred organization id. httpOnly: not readable by scripts. */
export async function setActiveOrganizationCookie(organizationId: string) {
  (await cookies()).set(ACTIVE_ORGANIZATION_COOKIE, organizationId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearActiveOrganizationCookie() {
  (await cookies()).delete(ACTIVE_ORGANIZATION_COOKIE);
}
