import { createClient, isAuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, inject, it } from "vitest";

import { createTimeoutFetch } from "@/lib/supabase/request-timeout";

/**
 * /auth/callback shows "link invalid" only when Supabase Auth really ANSWERS
 * that the code/token is bad, and a retryable "unavailable" page when Auth
 * can't be reached. That split relies on isAuthRetryableFetchError() (see
 * callAuth in src/lib/auth/session.ts). Checked here against the real local
 * Auth server and an unreachable one.
 */

/** In-memory storage holding an obviously fake PKCE verifier. */
function storageWithVerifier(storageKey: string) {
  const items = new Map([
    [`${storageKey}-code-verifier`, JSON.stringify("PLACEHOLDER-VERIFIER")],
  ]);
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
  };
}

function client(url: string) {
  const storageKey = "sb-classification-test";
  return createClient(url, inject("supabase").publishableKey, {
    global: { fetch: createTimeoutFetch({ timeoutMs: 3_000 }) },
    auth: {
      flowType: "pkce",
      storageKey,
      storage: storageWithVerifier(storageKey),
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

describe("Auth error classification for /auth/callback", () => {
  it("an unknown / used PKCE code is a real answer (→ link invalid)", async () => {
    const { data, error } = await client(
      inject("supabase").url,
    ).auth.exchangeCodeForSession("00000000-0000-4000-8000-000000000000");
    expect(data.user).toBeNull();
    expect(error).not.toBeNull();
    expect(isAuthRetryableFetchError(error)).toBe(false);
    expect(error!.status).toBeGreaterThanOrEqual(400);
    expect(error!.status).toBeLessThan(500);
  });

  it("an invalid token_hash is a real answer (→ link invalid)", async () => {
    const { error } = await client(inject("supabase").url).auth.verifyOtp({
      type: "signup",
      token_hash: "PLACEHOLDER-TOKEN-HASH",
    });
    expect(error).not.toBeNull();
    expect(isAuthRetryableFetchError(error)).toBe(false);
  });

  it("an unreachable Auth server is retryable (→ 'Pokušaj ponovo' page)", async () => {
    // Port 9 (discard) on localhost: nothing listens there.
    const { error } = await client("http://127.0.0.1:9").auth.exchangeCodeForSession(
      "00000000-0000-4000-8000-000000000000",
    );
    expect(isAuthRetryableFetchError(error)).toBe(true);
  });
});
