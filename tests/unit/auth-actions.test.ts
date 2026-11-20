// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCookieStore,
  createSupabaseDouble,
  RedirectSignal,
  type MembershipRow,
} from "./supabase-test-double";

const state = vi.hoisted(() => ({
  supabase: null as unknown,
  cookies: null as unknown,
}));

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

import { ACTIVE_ORGANIZATION_COOKIE } from "@/lib/auth/active-organization";
import {
  requestPasswordResetAction,
  signInAction,
  signOutAction,
  signUpAction,
  updatePasswordAction,
} from "@/lib/auth/actions";
import { authMessages } from "@/lib/auth/messages";
import {
  getActiveOrganization,
  MembershipsUnavailableError,
  requireOrganization,
} from "@/lib/auth/session";
import {
  createOrganizationAction,
  switchOrganizationAction,
} from "@/lib/organizations/actions";
import { GET as authContinue } from "@/app/auth/continue/route";
import { GET as authCallback } from "@/app/auth/callback/route";
import { NextRequest } from "next/server";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FOREIGN_ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

// Obvious placeholders that must never reach the user.
const LEAKY_DETAILS =
  "PLACEHOLDER-ACCESS-TOKEN PLACEHOLDER-API-KEY relation public.memberships at db.internal";

async function expectRedirect(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof RedirectSignal) return error.location;
    throw error;
  }
  throw new Error("expected a redirect");
}

function setup(options: Parameters<typeof createSupabaseDouble>[0] = {}, cookies = {}) {
  const double = createSupabaseDouble(options);
  state.supabase = double.client;
  state.cookies = createCookieStore(cookies);
  return { ...double, cookies: state.cookies as ReturnType<typeof createCookieStore> };
}

const registration = {
  fullName: "  Marko Marković ",
  email: "marko@primer.rs",
  password: "dugacka-lozinka",
  confirmPassword: "dugacka-lozinka",
  acceptTerms: true,
};

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("signUpAction", () => {
  it("creates the user with full_name metadata and a configured callback URL", async () => {
    const { client } = setup();
    const result = await signUpAction(registration);

    expect(client.auth.signUp).toHaveBeenCalledWith({
      email: "marko@primer.rs",
      password: "dugacka-lozinka",
      options: {
        data: { full_name: "Marko Marković" },
        emailRedirectTo: "http://localhost:3000/auth/callback?next=%2Fonboarding",
      },
    });
    expect(result).toEqual({ ok: true, message: authMessages.signUpCheckEmail });
    // No organization is created at sign-up.
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("goes straight to onboarding when the session is active immediately", async () => {
    const { client } = setup();
    client.auth.signUp.mockResolvedValueOnce({
      data: { user: { id: "u" }, session: {} },
      error: null,
    } as never);
    expect(await expectRedirect(signUpAction(registration))).toBe("/onboarding");
  });

  it("does not reveal that an email is already registered", async () => {
    const { client } = setup();
    client.auth.signUp.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "user_already_exists", message: "User already registered" },
    } as never);
    expect(await signUpAction(registration)).toEqual({
      ok: true,
      message: authMessages.signUpCheckEmail,
    });
  });

  it("re-validates on the server and never calls Supabase with invalid input", async () => {
    const { client } = setup();
    const result = await signUpAction({ ...registration, acceptTerms: false });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.fieldErrors?.acceptTerms).toBeTruthy();
    expect(client.auth.signUp).not.toHaveBeenCalled();
  });
});

describe("signInAction", () => {
  it("[8] user without an organization is sent to onboarding", async () => {
    setup({ memberships: [] });
    expect(
      await expectRedirect(signInAction({ email: "marko@primer.rs", password: "x" })),
    ).toBe("/onboarding");
  });

  it("[9] user with an organization is sent to the dashboard", async () => {
    setup({
      memberships: [
        { role: "owner", status: "active", organization: { id: ORG_A, name: "A" } },
      ],
    });
    expect(
      await expectRedirect(signInAction({ email: "marko@primer.rs", password: "x" })),
    ).toBe("/dashboard");
  });

  it("[12] ignores an external next URL", async () => {
    setup({
      memberships: [
        { role: "owner", status: "active", organization: { id: ORG_A, name: "A" } },
      ],
    });
    expect(
      await expectRedirect(
        signInAction({
          email: "marko@primer.rs",
          password: "x",
          next: "https://evil.example",
        }),
      ),
    ).toBe("/dashboard");
  });

  it("[13] follows a safe internal next path", async () => {
    setup({
      memberships: [
        { role: "owner", status: "active", organization: { id: ORG_A, name: "A" } },
      ],
    });
    expect(
      await expectRedirect(
        signInAction({
          email: "marko@primer.rs",
          password: "x",
          next: "/jobs?status=open",
        }),
      ),
    ).toBe("/jobs?status=open");
  });

  it("[18] maps auth errors to safe messages without internal details", async () => {
    const { client } = setup();
    const consoleSpies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "warn"),
    ];

    client.auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "invalid_credentials", message: `Invalid login ${LEAKY_DETAILS}` },
    } as never);
    const wrongPassword = await signInAction({ email: "marko@primer.rs", password: "x" });
    expect(wrongPassword).toEqual({
      ok: false,
      message: authMessages.invalidCredentials,
    });

    client.auth.signInWithPassword.mockResolvedValueOnce({
      data: { user: null, session: null },
      error: { code: "unexpected_failure", status: 500, message: LEAKY_DETAILS },
    } as never);
    const unexpected = await signInAction({ email: "marko@primer.rs", password: "x" });
    expect(unexpected).toEqual({ ok: false, message: authMessages.generic });

    for (const result of [wrongPassword, unexpected]) {
      expect(JSON.stringify(result)).not.toMatch(/PLACEHOLDER|db\.internal|memberships/);
    }
    for (const spy of consoleSpies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toMatch(/PLACEHOLDER/);
      }
    }
  });
});

describe("requestPasswordResetAction", () => {
  it("[6] returns the same neutral message whether or not the account exists", async () => {
    const { client } = setup();
    const known = await requestPasswordResetAction({ email: "postoji@primer.rs" });

    client.auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { code: "user_not_found", message: `User not found ${LEAKY_DETAILS}` },
    } as never);
    const unknown = await requestPasswordResetAction({ email: "nepostoji@primer.rs" });

    client.auth.resetPasswordForEmail.mockResolvedValueOnce({
      data: null,
      error: { code: "over_email_send_rate_limit", message: "rate limit" },
    } as never);
    const rateLimited = await requestPasswordResetAction({ email: "postoji@primer.rs" });

    const expected = {
      ok: true,
      message:
        "Ako postoji nalog sa ovom adresom, poslali smo uputstvo za promenu lozinke.",
    };
    expect(known).toEqual(expected);
    expect(unknown).toEqual(expected);
    expect(rateLimited).toEqual(expected);
    expect(client.auth.resetPasswordForEmail).toHaveBeenCalledWith("postoji@primer.rs", {
      redirectTo: "http://localhost:3000/auth/callback?next=%2Freset-password",
    });
  });
});

describe("updatePasswordAction", () => {
  const passwords = {
    password: "nova-dugacka-lozinka",
    confirmPassword: "nova-dugacka-lozinka",
  };

  it("rejects the change without a recovery session", async () => {
    const { client } = setup({ userId: null });
    expect(await updatePasswordAction(passwords)).toEqual({
      ok: false,
      message: authMessages.resetLinkInvalid,
    });
    expect(client.auth.updateUser).not.toHaveBeenCalled();
  });

  it("updates the password and continues into the app", async () => {
    const { client } = setup({
      memberships: [
        { role: "owner", status: "active", organization: { id: ORG_A, name: "A" } },
      ],
    });
    expect(await expectRedirect(updatePasswordAction(passwords))).toBe("/dashboard");
    expect(client.auth.updateUser).toHaveBeenCalledWith({
      password: "nova-dugacka-lozinka",
    });
  });
});

describe("signOutAction", () => {
  it("[17] signs out, clears the organization cookie and goes to /login", async () => {
    const { client, cookies } = setup({}, { [ACTIVE_ORGANIZATION_COOKIE]: ORG_A });
    expect(await expectRedirect(signOutAction())).toBe("/login?signed_out=1");
    expect(client.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(cookies.delete).toHaveBeenCalledWith(ACTIVE_ORGANIZATION_COOKIE);
  });

  it("[17] after sign-out the server guard denies private pages", async () => {
    setup({ userId: null });
    expect(await expectRedirect(requireOrganization())).toBe("/login");
  });
});

describe("createOrganizationAction", () => {
  const onboarding = {
    idempotencyKey: "6f1c1d3a-2b4e-4f6a-9c8d-1e2f3a4b5c6d",
    name: "Klima Servis Marko",
    businessType: "hvac_service" as const,
    countryCode: "RS" as const,
    currency: "RSD" as const,
    timezone: "Europe/Belgrade" as const,
    phone: "064 123 4567",
    email: "info@klima.rs",
    taxId: "123456789",
    registrationNumber: "",
    address: "",
    city: "Novi Sad",
    postalCode: "",
  };

  it("[15] calls the controlled RPC, never a direct insert", async () => {
    const { client, builders, cookies } = setup({ memberships: [] });
    expect(await expectRedirect(createOrganizationAction(onboarding))).toBe("/dashboard");

    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledWith("create_organization_with_details", {
      p_idempotency_key: onboarding.idempotencyKey,
      p_name: "Klima Servis Marko",
      p_business_type: "hvac_service",
      p_country_code: "RS",
      p_currency: "RSD",
      p_timezone: "Europe/Belgrade",
      p_phone: "064 123 4567",
      p_email: "info@klima.rs",
      p_tax_id: "123456789",
      p_registration_number: undefined,
      p_address: undefined,
      p_city: "Novi Sad",
      p_postal_code: undefined,
    });
    // No owner argument exists, and nothing writes tables directly.
    expect(builders.map((entry) => entry.table)).not.toContain("organizations");
    for (const { builder } of builders) {
      expect(builder.insert).not.toHaveBeenCalled();
    }
    expect(cookies.set).toHaveBeenCalledWith(
      ACTIVE_ORGANIZATION_COOKIE,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/" }),
    );
  });

  it("returns a retryable, non-technical error when the RPC fails", async () => {
    const { client, cookies } = setup({ memberships: [] });
    client.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "23505", message: `duplicate key value ${LEAKY_DETAILS}` },
    });
    const result = await createOrganizationAction(onboarding);
    expect(result).toEqual({ ok: false, message: authMessages.organizationCreateFailed });
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it("validates input before calling the database", async () => {
    const { client } = setup({ memberships: [] });
    const result = await createOrganizationAction({ ...onboarding, name: "" });
    expect(result.ok).toBe(false);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it("requires a signed-in user", async () => {
    const { client } = setup({ userId: null });
    expect(await expectRedirect(createOrganizationAction(onboarding))).toBe("/login");
    expect(client.rpc).not.toHaveBeenCalled();
  });
});

describe("switchOrganizationAction", () => {
  const memberships: MembershipRow[] = [
    { role: "owner", status: "active", organization: { id: ORG_A, name: "A" } },
    { role: "worker", status: "active", organization: { id: ORG_B, name: "B" } },
  ];

  it("[10] refuses an organization the user doesn't belong to", async () => {
    const { cookies } = setup({ memberships });
    expect(await switchOrganizationAction(FOREIGN_ORG)).toEqual({
      ok: false,
      message: authMessages.organizationAccessDenied,
    });
    expect(await switchOrganizationAction("not-a-uuid")).toEqual({
      ok: false,
      message: authMessages.organizationAccessDenied,
    });
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it("[11] refuses a suspended membership", async () => {
    // The double ignores the SQL filter and returns the suspended row,
    // proving the app code doesn't rely on that filter alone.
    const { cookies } = setup({
      memberships: [memberships[0], { ...memberships[1], status: "suspended" }],
    });
    expect(await switchOrganizationAction(ORG_B)).toEqual({
      ok: false,
      message: authMessages.organizationAccessDenied,
    });
    expect(cookies.set).not.toHaveBeenCalled();
  });

  it("[19] switches to another organization of the user", async () => {
    const { cookies } = setup({ memberships }, { [ACTIVE_ORGANIZATION_COOKIE]: ORG_A });
    expect(await expectRedirect(switchOrganizationAction(ORG_B))).toBe("/dashboard");
    expect(cookies.set).toHaveBeenCalledWith(
      ACTIVE_ORGANIZATION_COOKIE,
      ORG_B,
      expect.objectContaining({ httpOnly: true }),
    );
  });

  it("[19] the guard honors the switched organization", async () => {
    setup({ memberships }, { [ACTIVE_ORGANIZATION_COOKIE]: ORG_B });
    const context = await requireOrganization();
    expect(context.organization.organizationId).toBe(ORG_B);
    expect(context.organization.role).toBe("worker");
  });

  it("[10] a forged cookie for a foreign organization is ignored by the guard", async () => {
    setup({ memberships }, { [ACTIVE_ORGANIZATION_COOKIE]: FOREIGN_ORG });
    expect(await expectRedirect(requireOrganization())).toBe("/select-organization");
  });

  it("[11] a user whose only membership is suspended has no organization", async () => {
    setup({
      memberships: [{ ...memberships[0], status: "suspended" }],
    });
    expect(await expectRedirect(requireOrganization())).toBe("/onboarding");
  });
});

describe("membership read failures", () => {
  const membershipsError = {
    code: "PGRST000",
    message: `Could not connect ${LEAKY_DETAILS}`,
  };

  function spyConsole() {
    return [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "warn"),
    ];
  }

  function expectNoLeaks(spies: ReturnType<typeof spyConsole>, ...values: unknown[]) {
    for (const value of values) {
      expect(JSON.stringify(value) ?? "").not.toMatch(/PLACEHOLDER|db\.internal/);
    }
    for (const spy of spies) {
      for (const call of spy.mock.calls) {
        expect(JSON.stringify(call)).not.toMatch(/PLACEHOLDER/);
      }
    }
  }

  it("sign-in does not send the user to onboarding", async () => {
    const spies = spyConsole();
    setup({ membershipsError });
    const location = await expectRedirect(
      signInAction({ email: "marko@primer.rs", password: "x" }),
    );
    expect(location).toBe("/dashboard");
    expectNoLeaks(spies, location);
  });

  it("sign-in keeps a safe next path but never an org-setup page", async () => {
    setup({ membershipsError });
    expect(
      await expectRedirect(
        signInAction({ email: "marko@primer.rs", password: "x", next: "/jobs" }),
      ),
    ).toBe("/jobs");
    expect(
      await expectRedirect(
        signInAction({ email: "marko@primer.rs", password: "x", next: "/onboarding" }),
      ),
    ).toBe("/dashboard");
  });

  it("/auth/continue does not send the user to onboarding", async () => {
    setup({ membershipsError });
    const location = await expectRedirect(
      authContinue(new NextRequest("http://localhost:3000/auth/continue")),
    );
    expect(location).toBe("/dashboard");
  });

  it("/auth/callback (email confirmation) does not send the user to onboarding", async () => {
    setup({ membershipsError });
    const location = await expectRedirect(
      authCallback(
        new NextRequest(
          "http://localhost:3000/auth/callback?code=PLACEHOLDER-CODE&next=%2Fonboarding",
        ),
      ),
    );
    expect(location).toBe("/dashboard");
  });

  it("requireOrganization() throws a detail-free error instead of redirecting", async () => {
    const spies = spyConsole();
    setup({ membershipsError }, { [ACTIVE_ORGANIZATION_COOKIE]: ORG_A });
    const error = await requireOrganization().catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(MembershipsUnavailableError);
    expect(error).not.toBeInstanceOf(RedirectSignal);
    expectNoLeaks(spies, String(error), (error as Error).message);
  });

  it("getActiveOrganization() (onboarding gate) never reports 'no organization'", async () => {
    setup({ membershipsError });
    await expect(getActiveOrganization()).rejects.toBeInstanceOf(
      MembershipsUnavailableError,
    );
  });

  it("switching returns a retryable message, not access denied", async () => {
    const spies = spyConsole();
    const { cookies } = setup({ membershipsError });
    const result = await switchOrganizationAction(ORG_A);
    expect(result).toEqual({ ok: false, message: authMessages.membershipsUnavailable });
    expect(result).not.toEqual({
      ok: false,
      message: authMessages.organizationAccessDenied,
    });
    expect(cookies.set).not.toHaveBeenCalled();
    expectNoLeaks(spies, result);
  });

  it("a signed-out user is still sent to /login", async () => {
    setup({ userId: null, membershipsError });
    expect(await expectRedirect(requireOrganization())).toBe("/login");
  });
});
