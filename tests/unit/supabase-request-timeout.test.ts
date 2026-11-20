// @vitest-environment node
import { AuthRetryableFetchError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCookieStore,
  createSupabaseDouble,
  RedirectSignal,
} from "./supabase-test-double";

/**
 * A stopped PostgREST / Auth container behind Kong: the request is accepted
 * but never answered. These tests use the REAL server/proxy Supabase clients
 * with a fetch that never resolves, and fake timers to prove the timeout
 * fires and maps to the existing safe error paths.
 */

const state = vi.hoisted(() => ({
  cookies: null as unknown,
  // When set, createSupabaseServerClient() returns this double instead of
  // the real client.
  double: null as unknown,
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
vi.mock("@/lib/supabase/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/server")>();
  return {
    createSupabaseServerClient: async () =>
      state.double ?? actual.createSupabaseServerClient(),
  };
});

import { GET as continueRoute } from "@/app/auth/continue/route";
import { AuthUnavailableError, MembershipsUnavailableError } from "@/lib/auth/errors";
import {
  getAuthUser,
  listActiveMemberships,
  requireOrganization,
} from "@/lib/auth/session";
import {
  AuthDeadlineExceededError,
  createTimeoutFetch,
  SUPABASE_AUTH_DEADLINE_MS,
  SUPABASE_REQUEST_TIMEOUT_MS,
  withAuthDeadline,
} from "@/lib/supabase/request-timeout";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { proxy } from "@/proxy";

const SUPABASE_URL = "http://127.0.0.1:54321";
// Cookie name @supabase/ssr derives from the URL host ("127").
const SESSION_COOKIE = "sb-127-auth-token";
const USER_ID = "11111111-1111-4111-8111-111111111111";

const b64url = (value: string) => Buffer.from(value).toString("base64url");

/**
 * JWT-shaped but obviously fake (HS256 with a placeholder signature), so
 * getClaims() has to ask Auth (getUser) instead of failing locally.
 */
function fakeAccessToken(expiresAt: number) {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      sub: USER_ID,
      aud: "authenticated",
      role: "authenticated",
      exp: expiresAt,
    }),
  );
  return `${header}.${payload}.${b64url("PLACEHOLDER-SIGNATURE")}`;
}

/** Obviously fake session cookie value in @supabase/ssr's base64url format. */
function sessionCookie({ expired = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = expired ? now - 60 : now + 3600;
  const session = {
    access_token: fakeAccessToken(expiresAt),
    refresh_token: "PLACEHOLDER-REFRESH-TOKEN",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user: { id: USER_ID, aud: "authenticated", email: "korisnik@primer.test" },
  };
  return `base64-${b64url(JSON.stringify(session))}`;
}

/**
 * Like a real fetch to an upstream that never answers: pending forever,
 * rejects only when its signal aborts (with the signal's reason).
 */
const hangingFetch = vi.fn(
  (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_, reject) => {
      const signal = init?.signal;
      if (!signal) return;
      if (signal.aborted) reject(signal.reason);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }),
);

/** Paths requested from the (hanging) upstream; never full URLs with tokens. */
function requestedPaths() {
  return hangingFetch.mock.calls.map(
    ([input]) =>
      new URL(
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      ).pathname,
  );
}

/** Settles a promise into a plain outcome without letting it reject unhandled. */
function track<T>(promise: Promise<T>) {
  const result: { settled: boolean; value?: T; error?: unknown; redirect?: string } = {
    settled: false,
  };
  promise.then(
    (value) => Object.assign(result, { settled: true, value }),
    (error: unknown) =>
      Object.assign(result, {
        settled: true,
        error,
        redirect: error instanceof RedirectSignal ? error.location : undefined,
      }),
  );
  return result;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "PLACEHOLDER-PUBLISHABLE-KEY");
  vi.stubGlobal("fetch", hangingFetch);
  hangingFetch.mockClear();
  state.cookies = createCookieStore();
  state.double = null;
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function loggedText() {
  return JSON.stringify(consoleError.mock.calls);
}

describe("createTimeoutFetch", () => {
  it("aborts a request that never answers after the timeout, not before", async () => {
    const timedFetch = createTimeoutFetch({ fetchImpl: hangingFetch });
    const result = track(timedFetch(`${SUPABASE_URL}/rest/v1/memberships`));

    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS - 1);
    expect(result.settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(result.settled).toBe(true);
    expect(result.error).toMatchObject({ name: "TimeoutError" });
  });

  it("logs only a safe code and the service, never the URL, token or key", async () => {
    const timedFetch = createTimeoutFetch({ fetchImpl: hangingFetch });
    track(
      timedFetch(
        `${SUPABASE_URL}/auth/v1/verify?token=PLACEHOLDER-TOKEN&apikey=PLACEHOLDER-KEY`,
        { headers: { Authorization: "Bearer PLACEHOLDER-ACCESS-TOKEN" } },
      ),
    );
    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS);

    expect(consoleError).toHaveBeenCalledWith("[supabase] request_timeout", {
      service: "auth",
      timeoutMs: SUPABASE_REQUEST_TIMEOUT_MS,
    });
    expect(loggedText()).not.toMatch(/PLACEHOLDER|127\.0\.0\.1|verify|Bearer/);
  });

  it("keeps honoring a caller-provided signal (no timeout log for a caller abort)", async () => {
    const timedFetch = createTimeoutFetch({ fetchImpl: hangingFetch });
    const caller = new AbortController();
    const result = track(
      timedFetch(`${SUPABASE_URL}/rest/v1/x`, { signal: caller.signal }),
    );

    caller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(result.error).toMatchObject({ name: "AbortError" });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("passes a fast response through unchanged", async () => {
    const ok = new Response("[]", { status: 200 });
    const timedFetch = createTimeoutFetch({ fetchImpl: vi.fn(async () => ok) });
    await expect(timedFetch(`${SUPABASE_URL}/rest/v1/x`)).resolves.toBe(ok);
  });
});

describe("withAuthDeadline", () => {
  it("rejects after the deadline even if the call never settles", async () => {
    const result = track(withAuthDeadline(new Promise(() => undefined)));
    await vi.advanceTimersByTimeAsync(SUPABASE_AUTH_DEADLINE_MS);
    expect(result.error).toBeInstanceOf(AuthDeadlineExceededError);
    expect(consoleError).toHaveBeenCalledWith("[supabase] auth_deadline_exceeded", {
      deadlineMs: SUPABASE_AUTH_DEADLINE_MS,
    });
  });
});

describe("server client (real supabase-js) against a hanging Data API", () => {
  it("a membership query times out into MembershipsUnavailableError (retryable boundary)", async () => {
    state.cookies = createCookieStore({ [SESSION_COOKIE]: sessionCookie() });
    const supabase = await createSupabaseServerClient();
    const result = track(listActiveMemberships(supabase, USER_ID));

    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS);

    expect(result.error).toBeInstanceOf(MembershipsUnavailableError);
    // No postgrest-js retries multiplying the timeout.
    expect(hangingFetch).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith("[auth] memberships_unavailable", {
      code: "request_failed",
    });
    expect(loggedText()).not.toMatch(/PLACEHOLDER|11111111-1111/);
  });

  it("getUser() timing out is 'unavailable', not signed in and not signed out", async () => {
    state.cookies = createCookieStore({ [SESSION_COOKIE]: sessionCookie() });
    const supabase = await createSupabaseServerClient();
    const result = track(getAuthUser(supabase));

    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS);

    expect(result.value).toEqual({ status: "unavailable" });
    expect(requestedPaths()).toEqual(["/auth/v1/user"]);
    // The session cookie is kept (no sign-out during an outage).
    const cookies = state.cookies as ReturnType<typeof createCookieStore>;
    expect(cookies.delete).not.toHaveBeenCalled();
    expect(cookies.values.get(SESSION_COOKIE)).toBeDefined();
  });

  it("an expired session whose refresh keeps timing out stops at the Auth deadline", async () => {
    // auth-js would otherwise retry the refresh with backoff for ~30 s.
    state.cookies = createCookieStore({
      [SESSION_COOKIE]: sessionCookie({ expired: true }),
    });
    const supabase = await createSupabaseServerClient();
    const result = track(getAuthUser(supabase));

    await vi.advanceTimersByTimeAsync(SUPABASE_AUTH_DEADLINE_MS - 1);
    expect(result.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(result.value).toEqual({ status: "unavailable" });
    // auth-js retried the refresh; the deadline cut it short.
    expect(requestedPaths().length).toBeGreaterThan(1);
    expect(new Set(requestedPaths())).toEqual(new Set(["/auth/v1/token"]));
  });

  it("a protected page shows the retryable error, never grants access or redirects", async () => {
    state.cookies = createCookieStore({ [SESSION_COOKIE]: sessionCookie() });
    const result = track(requireOrganization());

    await vi.advanceTimersByTimeAsync(SUPABASE_AUTH_DEADLINE_MS);

    expect(result.error).toBeInstanceOf(AuthUnavailableError);
    expect(result.redirect).toBeUndefined();
    expect(result.value).toBeUndefined();
    expect(requestedPaths()).toEqual(["/auth/v1/user"]);
  });
});

describe("DAL with Auth reachable but the Data API hanging", () => {
  it("requireOrganization() fails within one request timeout with the memberships error", async () => {
    // Auth answers (double), memberships go through the real client and hang.
    const double = createSupabaseDouble();
    const realClient = await createSupabaseServerClient();
    double.client.from = vi.fn((table: string) =>
      realClient.from(table as "memberships"),
    ) as never;
    state.double = double.client;

    const result = track(requireOrganization());
    // Profile and memberships run in parallel: one timeout, not two.
    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS);

    expect(result.error).toBeInstanceOf(MembershipsUnavailableError);
    expect(result.redirect).toBeUndefined();
    expect(requestedPaths().sort()).toEqual([
      "/rest/v1/memberships",
      "/rest/v1/profiles",
    ]);
  });
});

describe("Auth errors fail closed without loops", () => {
  const retryable = new AuthRetryableFetchError("PLACEHOLDER-RAW upstream", 502);

  it("requireOrganization() throws AuthUnavailableError on a retryable Auth error", async () => {
    const double = createSupabaseDouble();
    double.client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: retryable,
    } as never);
    state.double = double.client;

    await expect(requireOrganization()).rejects.toBeInstanceOf(AuthUnavailableError);
    expect(loggedText()).not.toContain("PLACEHOLDER-RAW");
  });

  it("/auth/continue keeps the session and goes into the app instead of /login", async () => {
    const double = createSupabaseDouble();
    double.client.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: retryable,
    } as never);
    state.double = double.client;

    const result = track(
      continueRoute(new NextRequest("http://localhost:3000/auth/continue?next=%2Fjobs")),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(result.redirect).toBe("/jobs");
    expect(double.client.auth.signOut).not.toHaveBeenCalled();
  });

  it("proxy: Auth hanging on a protected page → /login within the deadline", async () => {
    const request = new NextRequest("http://localhost:3000/dashboard");
    request.cookies.set(SESSION_COOKIE, sessionCookie());
    const result = track(proxy(request));

    await vi.advanceTimersByTimeAsync(SUPABASE_REQUEST_TIMEOUT_MS - 1);
    expect(result.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(SUPABASE_AUTH_DEADLINE_MS);

    expect(result.settled).toBe(true);
    expect(requestedPaths()).toContain("/auth/v1/user");
    const response = result.value as Response;
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fdashboard",
    );
  });

  it("proxy: an expired session whose refresh hangs → /login at the Auth deadline", async () => {
    const request = new NextRequest("http://localhost:3000/jobs");
    request.cookies.set(SESSION_COOKIE, sessionCookie({ expired: true }));
    const result = track(proxy(request));

    await vi.advanceTimersByTimeAsync(SUPABASE_AUTH_DEADLINE_MS - 1);
    expect(result.settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const response = result.value as Response;
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fjobs",
    );
    expect(new Set(requestedPaths())).toEqual(new Set(["/auth/v1/token"]));
  });

  it("proxy: Auth hanging on /login → page is served (no redirect loop)", async () => {
    const request = new NextRequest("http://localhost:3000/login?next=%2Fdashboard");
    request.cookies.set(SESSION_COOKIE, sessionCookie());
    const result = track(proxy(request));

    await vi.advanceTimersByTimeAsync(SUPABASE_AUTH_DEADLINE_MS);

    const response = result.value as Response;
    expect(requestedPaths()).toContain("/auth/v1/user");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
    // Session cookies are not cleared.
    expect(response.headers.get("set-cookie") ?? "").not.toContain(SESSION_COOKIE);
  });
});
