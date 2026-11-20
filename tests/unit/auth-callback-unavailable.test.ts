// @vitest-environment node
import {
  AuthApiError,
  AuthPKCECodeVerifierMissingError,
  AuthRetryableFetchError,
} from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCookieStore,
  createSupabaseDouble,
  RedirectSignal,
} from "./supabase-test-double";

/**
 * /auth/callback must tell two failures apart:
 *   1. Auth didn't answer (timeout / network / 5xx) → 503 page in place with
 *      "Pokušaj ponovo", PKCE verifier kept, nothing sensitive echoed;
 *   2. Auth answered "invalid / expired / used" → the existing link_invalid
 *      (or reset_link_invalid) redirect.
 */

const state = vi.hoisted(() => ({ cookies: null as unknown, double: null as unknown }));

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
vi.mock("@/lib/supabase/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/server")>();
  return {
    createSupabaseServerClient: async () =>
      state.double ?? actual.createSupabaseServerClient(),
  };
});

import { GET as callback } from "@/app/auth/callback/route";
import { SUPABASE_REQUEST_TIMEOUT_MS } from "@/lib/supabase/request-timeout";

const CODE = "PLACEHOLDER-AUTH-CODE";
const TOKEN_HASH = "PLACEHOLDER-TOKEN-HASH";
const VERIFIER_COOKIE = "sb-127-auth-token-code-verifier";
const VERIFIER_VALUE = `base64-${Buffer.from(JSON.stringify("PLACEHOLDER-VERIFIER")).toString("base64url")}`;
const SECRETS = /PLACEHOLDER|code=|token_hash|verifier|apikey|Bearer|sb-127/i;

type Outcome = { redirect?: string; response?: Response };

async function run(url: string): Promise<Outcome> {
  try {
    return { response: (await callback(new NextRequest(url))) as Response };
  } catch (error) {
    if (error instanceof RedirectSignal) return { redirect: error.location };
    throw error;
  }
}

function cookieStore() {
  return state.cookies as ReturnType<typeof createCookieStore>;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.cookies = createCookieStore({ [VERIFIER_COOKIE]: VERIFIER_VALUE });
  state.double = null;
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The double, with auth-js's "delete the verifier on any failure" behavior. */
function doubleFailing(method: "exchangeCodeForSession" | "verifyOtp", error: unknown) {
  const double = createSupabaseDouble();
  double.client.auth[method].mockImplementation((async () => {
    cookieStore().set(VERIFIER_COOKIE, "");
    return { data: { user: null, session: null }, error };
  }) as never);
  state.double = double.client;
  return double.client;
}

async function expectUnavailablePage(outcome: Outcome) {
  expect(outcome.redirect).toBeUndefined();
  const response = outcome.response!;
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  const html = await response.text();
  expect(html).toContain("Prijava trenutno nije dostupna");
  expect(html).toContain(
    "Servis za prijavu trenutno ne odgovara, pa link nismo mogli da proverimo. Pokušajte ponovo za nekoliko trenutaka.",
  );
  // Retry = the same URL (href=""), so the code never appears in the page.
  expect(html).toContain('<a class="primary" href="">Pokušaj ponovo</a>');
  expect(html).not.toMatch(SECRETS);
  expect(html).not.toMatch(/nije važeći|istekao/);
  return html;
}

describe("1. Auth unavailable during the callback", () => {
  it.each([
    ["timeout / network (status 0)", 0],
    ["gateway 502", 502],
    ["gateway 504", 504],
  ])("PKCE exchange, %s → retryable page, not 'link invalid'", async (_label, status) => {
    doubleFailing(
      "exchangeCodeForSession",
      new AuthRetryableFetchError("PLACEHOLDER-RAW upstream detail", status),
    );
    const outcome = await run(
      `http://localhost:3000/auth/callback?code=${CODE}&next=%2Fonboarding`,
    );
    await expectUnavailablePage(outcome);
  });

  it("restores the PKCE verifier so 'Pokušaj ponovo' can complete the same exchange", async () => {
    doubleFailing("exchangeCodeForSession", new AuthRetryableFetchError("x", 0));
    await run(`http://localhost:3000/auth/callback?code=${CODE}`);

    expect(cookieStore().values.get(VERIFIER_COOKIE)).toBe(VERIFIER_VALUE);
    expect(cookieStore().set).toHaveBeenLastCalledWith(
      VERIFIER_COOKIE,
      VERIFIER_VALUE,
      expect.objectContaining({ path: "/", sameSite: "lax" }),
    );
  });

  it("recovery link with Auth down → retryable page, not 'reset link invalid'", async () => {
    doubleFailing("exchangeCodeForSession", new AuthRetryableFetchError("x", 0));
    const outcome = await run(
      `http://localhost:3000/auth/callback?code=${CODE}&next=%2Freset-password`,
    );
    await expectUnavailablePage(outcome);
  });

  it("token_hash link with Auth down → retryable page", async () => {
    doubleFailing("verifyOtp", new AuthRetryableFetchError("x", 503));
    const outcome = await run(
      `http://localhost:3000/auth/callback?token_hash=${TOKEN_HASH}&type=signup`,
    );
    await expectUnavailablePage(outcome);
  });

  it("logs only a safe code, never the code, token, cookie or upstream message", async () => {
    doubleFailing(
      "exchangeCodeForSession",
      new AuthRetryableFetchError("PLACEHOLDER-RAW upstream detail", 0),
    );
    await run(`http://localhost:3000/auth/callback?code=${CODE}`);
    const logged = JSON.stringify(consoleError.mock.calls);
    expect(consoleError).toHaveBeenCalledWith("[auth] auth_unavailable", { status: 0 });
    expect(logged).not.toMatch(SECRETS);
  });

  it("real client: an exchange that never answers ends in the retryable page at the timeout", async () => {
    vi.useFakeTimers();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "PLACEHOLDER-PUBLISHABLE-KEY");
    const hanging = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal!.reason), {
            once: true,
          });
        }),
    );
    vi.stubGlobal("fetch", hanging);

    let outcome: Outcome | undefined;
    void run(`http://localhost:3000/auth/callback?code=${CODE}`).then((value) => {
      outcome = value;
    });
    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS - 1);
    expect(outcome).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);

    expect(hanging).toHaveBeenCalledOnce();
    expect(new URL(String(hanging.mock.calls[0][0])).pathname).toBe("/auth/v1/token");
    await expectUnavailablePage(outcome!);
    expect(cookieStore().values.get(VERIFIER_COOKIE)).toBe(VERIFIER_VALUE);
  });
});

describe("2. Really invalid, expired or used code/token keeps the 'link invalid' behavior", () => {
  it.each([
    ["expired code", new AuthApiError("PLACEHOLDER-RAW", 403, "otp_expired")],
    [
      "unknown / used code",
      new AuthApiError("PLACEHOLDER-RAW", 404, "flow_state_not_found"),
    ],
    ["wrong verifier", new AuthApiError("PLACEHOLDER-RAW", 400, "bad_code_verifier")],
    ["verifier missing (other browser)", new AuthPKCECodeVerifierMissingError()],
  ])("PKCE: %s → /login?error=link_invalid", async (_label, error) => {
    doubleFailing("exchangeCodeForSession", error);
    const outcome = await run(`http://localhost:3000/auth/callback?code=${CODE}`);
    expect(outcome.redirect).toBe("/login?error=link_invalid");
    expect(outcome.redirect).not.toMatch(SECRETS);
    // Nothing to retry: the verifier is not restored.
    expect(cookieStore().values.get(VERIFIER_COOKIE)).toBe("");
  });

  it("recovery: invalid code → /forgot-password?error=reset_link_invalid", async () => {
    doubleFailing(
      "exchangeCodeForSession",
      new AuthApiError("PLACEHOLDER-RAW", 403, "otp_expired"),
    );
    const outcome = await run(
      `http://localhost:3000/auth/callback?code=${CODE}&next=%2Freset-password`,
    );
    expect(outcome.redirect).toBe("/forgot-password?error=reset_link_invalid");
  });

  it("token_hash: expired token → /login?error=link_invalid", async () => {
    doubleFailing("verifyOtp", new AuthApiError("PLACEHOLDER-RAW", 403, "otp_expired"));
    const outcome = await run(
      `http://localhost:3000/auth/callback?token_hash=${TOKEN_HASH}&type=signup`,
    );
    expect(outcome.redirect).toBe("/login?error=link_invalid");
  });
});
