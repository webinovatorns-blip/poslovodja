// @vitest-environment node
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCookieStore,
  createSupabaseDouble,
  RedirectSignal,
  type MembershipRow,
} from "./supabase-test-double";

const state = vi.hoisted(() => ({ supabase: null as unknown, cookies: null as unknown }));

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new RedirectSignal(location);
  },
}));
vi.mock("next/headers", () => ({ cookies: async () => state.cookies }));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => state.supabase,
}));

import { GET as callback } from "@/app/auth/callback/route";
import { GET as continueRoute } from "@/app/auth/continue/route";
import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/active-organization";
import { signInAction } from "@/lib/auth/actions";
import {
  isMembershipsUnavailableError,
  MEMBERSHIPS_UNAVAILABLE_DIGEST,
  MembershipsUnavailableError,
} from "@/lib/auth/errors";
import { authMessages } from "@/lib/auth/messages";
import { decidePostAuthDestination } from "@/lib/auth/route-rules";
import {
  getActiveOrganization,
  listActiveMemberships,
  requireOrganization,
} from "@/lib/auth/session";
import { switchOrganizationAction } from "@/lib/organizations/actions";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
// Obvious placeholder for a raw upstream error that must never reach users.
const RAW_ERROR = {
  code: "PGRST000",
  message:
    "PLACEHOLDER-RAW: connection to db.internal refused for relation public.memberships",
};

const twoOrgs: MembershipRow[] = [
  { role: "owner", status: "active", organization: { id: ORG_A, name: "Alfa" } },
  { role: "worker", status: "active", organization: { id: ORG_B, name: "Beta" } },
];

function setup(options: Parameters<typeof createSupabaseDouble>[0] = {}, cookies = {}) {
  const double = createSupabaseDouble(options);
  state.supabase = double.client;
  state.cookies = createCookieStore(cookies);
  return double;
}

async function outcome(promise: Promise<unknown>) {
  try {
    return { value: await promise };
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirect: error.location };
    return { error };
  }
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("listActiveMemberships", () => {
  it("[1] a successful empty result is an empty list → onboarding state", async () => {
    const { client } = setup({ memberships: [] });
    await expect(listActiveMemberships(client as never, "user")).resolves.toEqual([]);
    expect((await outcome(requireOrganization())).redirect).toBe("/onboarding");
  });

  it("[2] a failed query throws a typed error instead of returning []", async () => {
    const { client } = setup({ membershipsError: RAW_ERROR });
    const result = await outcome(listActiveMemberships(client as never, "user"));
    expect(result.error).toBeInstanceOf(MembershipsUnavailableError);
    expect(result).not.toHaveProperty("value");
  });

  it("the typed error carries a stable digest and no upstream detail", () => {
    const error = new MembershipsUnavailableError();
    expect(error.digest).toBe(MEMBERSHIPS_UNAVAILABLE_DIGEST);
    expect(error.message).toBe("memberships_unavailable");
    // Recognized after crossing the server → client boundary (only digest survives).
    expect(
      isMembershipsUnavailableError({ digest: MEMBERSHIPS_UNAVAILABLE_DIGEST }),
    ).toBe(true);
    expect(isMembershipsUnavailableError(new Error("other"))).toBe(false);
  });

  it("logs only a safe code (no message, user id, tokens or cookies)", async () => {
    const { client } = setup({ membershipsError: RAW_ERROR });
    await outcome(
      listActiveMemberships(client as never, "11111111-1111-4111-8111-111111111111"),
    );
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(logged).toContain("memberships_unavailable");
    expect(logged).toContain("PGRST000");
    expect(logged).not.toMatch(/PLACEHOLDER-RAW|db\.internal|11111111-1111/);
  });
});

describe("[3] a failed read never leads to onboarding", () => {
  it("server guards throw the typed error (error boundary) instead of redirecting", async () => {
    setup({ membershipsError: RAW_ERROR });
    const guarded = await outcome(requireOrganization());
    expect(guarded.redirect).toBeUndefined();
    expect(isMembershipsUnavailableError(guarded.error)).toBe(true);

    const gate = await outcome(getActiveOrganization());
    expect(gate.redirect).toBeUndefined();
    expect(isMembershipsUnavailableError(gate.error)).toBe(true);
  });

  it("sign-in continues into the app (which shows the retryable error), not onboarding", async () => {
    setup({ membershipsError: RAW_ERROR });
    expect(
      (await outcome(signInAction({ email: "a@primer.rs", password: "x" }))).redirect,
    ).toBe("/dashboard");
    expect(
      (
        await outcome(
          signInAction({ email: "a@primer.rs", password: "x", next: "/jobs" }),
        )
      ).redirect,
    ).toBe("/jobs");
  });

  it("/auth/continue and /auth/callback don't send the user to onboarding", async () => {
    setup({ membershipsError: RAW_ERROR });
    expect(
      (
        await outcome(
          continueRoute(new NextRequest("http://localhost:3000/auth/continue")),
        )
      ).redirect,
    ).toBe("/dashboard");

    // The sign-up confirmation link asks for /onboarding: not while the state is unknown.
    expect(
      (
        await outcome(
          callback(
            new NextRequest(
              "http://localhost:3000/auth/callback?code=PLACEHOLDER-CODE&next=%2Fonboarding",
            ),
          ),
        )
      ).redirect,
    ).toBe("/dashboard");
  });

  it("route rule: 'unavailable' keeps a safe next but never an org-setup or guest page", () => {
    expect(decidePostAuthDestination("unavailable")).toBe("/dashboard");
    expect(decidePostAuthDestination("unavailable", "/onboarding")).toBe("/dashboard");
    expect(decidePostAuthDestination("unavailable", "/select-organization")).toBe(
      "/dashboard",
    );
    expect(decidePostAuthDestination("unavailable", "/login")).toBe("/dashboard");
    expect(decidePostAuthDestination("unavailable", "/team")).toBe("/team");
    expect(decidePostAuthDestination("unavailable", "https://evil.example")).toBe(
      "/dashboard",
    );
  });
});

describe("switchOrganizationAction during an outage", () => {
  it("[4][6] returns the safe temporary message, no raw detail, no cookie change", async () => {
    setup({ membershipsError: RAW_ERROR });
    const result = await switchOrganizationAction(ORG_A);
    expect(result).toEqual({ ok: false, message: authMessages.organizationsUnavailable });
    expect(JSON.stringify(result)).not.toMatch(/PLACEHOLDER-RAW|db\.internal|PGRST/);
    expect(
      (state.cookies as ReturnType<typeof createCookieStore>).set,
    ).not.toHaveBeenCalled();
  });
});

describe("[7] normal organization selection still works", () => {
  it("one organization is selected automatically", async () => {
    setup({ memberships: [twoOrgs[0]] });
    const context = await requireOrganization();
    expect(context.organization.organizationId).toBe(ORG_A);
  });

  it("several organizations require a choice, and a valid cookie selects one", async () => {
    setup({ memberships: twoOrgs });
    expect((await outcome(requireOrganization())).redirect).toBe("/select-organization");

    setup({ memberships: twoOrgs }, { [ACTIVE_ORGANIZATION_COOKIE]: ORG_B });
    expect((await requireOrganization()).organization.organizationId).toBe(ORG_B);
  });

  it("switching to a member organization still succeeds", async () => {
    setup({ memberships: twoOrgs });
    expect((await outcome(switchOrganizationAction(ORG_B))).redirect).toBe("/dashboard");
  });
});
