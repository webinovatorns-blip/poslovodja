// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const CODE = "PLACEHOLDER-AUTH-CODE";

async function locationOf(
  handler: (request: NextRequest) => Promise<unknown>,
  url: string,
) {
  try {
    await handler(new NextRequest(url));
  } catch (error) {
    if (error instanceof RedirectSignal) return error.location;
    throw error;
  }
  throw new Error("expected a redirect");
}

function setup(memberships: MembershipRow[] = []) {
  const double = createSupabaseDouble({ memberships });
  state.supabase = double.client;
  state.cookies = createCookieStore();
  return double.client;
}

const withOrg = [
  {
    role: "owner" as const,
    status: "active" as const,
    organization: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "A" },
  },
];

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("/auth/callback", () => {
  it("exchanges the PKCE code and continues to onboarding for a new user", async () => {
    const client = setup([]);
    const location = await locationOf(
      callback,
      `http://localhost:3000/auth/callback?code=${CODE}&next=%2Fonboarding`,
    );
    expect(client.auth.exchangeCodeForSession).toHaveBeenCalledWith(CODE);
    expect(location).toBe("/onboarding");
  });

  it("[12] never redirects to an external next URL", async () => {
    setup(withOrg);
    const location = await locationOf(
      callback,
      `http://localhost:3000/auth/callback?code=${CODE}&next=https%3A%2F%2Fevil.example`,
    );
    expect(location).toBe("/dashboard");
  });

  it("[18] an invalid or expired link shows a fixed error key, never the code or upstream text", async () => {
    const client = setup([]);
    client.auth.exchangeCodeForSession.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "otp_expired", message: "PLACEHOLDER internal detail" },
    } as never);
    const errorSpy = vi.spyOn(console, "error");

    const location = await locationOf(
      callback,
      `http://localhost:3000/auth/callback?code=${CODE}&next=%2Fonboarding`,
    );

    expect(location).toBe("/login?error=link_invalid");
    expect(location).not.toContain(CODE);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(CODE);
  });

  it("recovery links go to /reset-password; broken ones back to /forgot-password", async () => {
    setup(withOrg);
    expect(
      await locationOf(
        callback,
        `http://localhost:3000/auth/callback?code=${CODE}&next=%2Freset-password`,
      ),
    ).toBe("/reset-password");

    expect(
      await locationOf(
        callback,
        "http://localhost:3000/auth/callback?next=%2Freset-password",
      ),
    ).toBe("/forgot-password?error=reset_link_invalid");
  });

  it("supports token_hash links (cross-device) and rejects unknown OTP types", async () => {
    const client = setup(withOrg);
    expect(
      await locationOf(
        callback,
        "http://localhost:3000/auth/callback?token_hash=PLACEHOLDER-HASH&type=signup",
      ),
    ).toBe("/dashboard");
    expect(client.auth.verifyOtp).toHaveBeenCalledWith({
      type: "signup",
      token_hash: "PLACEHOLDER-HASH",
    });

    expect(
      await locationOf(
        callback,
        "http://localhost:3000/auth/callback?token_hash=PLACEHOLDER-HASH&type=bogus",
      ),
    ).toBe("/login?error=link_invalid");
  });
});

describe("/auth/continue", () => {
  it("[8] signed-in user without an organization → onboarding", async () => {
    setup([]);
    expect(await locationOf(continueRoute, "http://localhost:3000/auth/continue")).toBe(
      "/onboarding",
    );
  });

  it("[9] signed-in user with an organization → dashboard", async () => {
    setup(withOrg);
    expect(await locationOf(continueRoute, "http://localhost:3000/auth/continue")).toBe(
      "/dashboard",
    );
  });

  it("clears a session Supabase rejects instead of looping", async () => {
    const double = createSupabaseDouble({ userId: null });
    state.supabase = double.client;
    state.cookies = createCookieStore();
    expect(await locationOf(continueRoute, "http://localhost:3000/auth/continue")).toBe(
      "/login?error=session_expired",
    );
    expect(double.client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
