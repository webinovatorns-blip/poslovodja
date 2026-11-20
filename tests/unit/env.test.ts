import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { getPublicEnv } from "@/lib/env";
import { EnvValidationError, isSecretSupabaseKey } from "@/lib/env-shared";
import { findLeakedPublicSecrets, getServerEnv } from "@/lib/env.server";

// Shapes of real keys (values are the public local-development demo keys).
const LEGACY_ANON_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.sig";
const LEGACY_SERVICE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.sig";
// Obviously fake, short test value (not a real key format).
const SECRET_VALUE = "sb_secret_FAKE";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getPublicEnv", () => {
  it("returns validated Supabase variables", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    expect(getPublicEnv()).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    });
  });

  it("names every missing variable", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    try {
      getPublicEnv();
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).variables).toEqual([
        "NEXT_PUBLIC_SUPABASE_URL",
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ]);
    }
  });

  it("rejects a secret key in the browser variable without echoing it", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", SECRET_VALUE);
    expect(() => getPublicEnv()).toThrow(/SECRET\/service_role key/);
    expect(() => getPublicEnv()).not.toThrow(new RegExp(SECRET_VALUE));
  });

  it("rejects a legacy service_role JWT in the browser variable", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", LEGACY_SERVICE_JWT);
    expect(() => getPublicEnv()).toThrow(EnvValidationError);
  });

  it("accepts a legacy anon JWT", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", LEGACY_ANON_JWT);
    expect(getPublicEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe(LEGACY_ANON_JWT);
  });
});

describe("getServerEnv", () => {
  it("returns the secret key", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", SECRET_VALUE);
    expect(getServerEnv().SUPABASE_SECRET_KEY).toBe(SECRET_VALUE);
  });

  it("reports a missing secret by name only", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(() => getServerEnv()).toThrow(/SUPABASE_SECRET_KEY: is missing/);
  });

  it("rejects a publishable key in the secret slot", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_publishable_test");
    expect(() => getServerEnv()).toThrow(/publishable\/anon key/);
  });
});

describe("secret key detection", () => {
  it("classifies keys", () => {
    expect(isSecretSupabaseKey(SECRET_VALUE)).toBe(true);
    expect(isSecretSupabaseKey(LEGACY_SERVICE_JWT)).toBe(true);
    expect(isSecretSupabaseKey(LEGACY_ANON_JWT)).toBe(false);
    expect(isSecretSupabaseKey("sb_publishable_x")).toBe(false);
  });

  it("finds secrets leaked into NEXT_PUBLIC_ variables", () => {
    expect(
      findLeakedPublicSecrets({
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_x",
        NEXT_PUBLIC_OOPS: SECRET_VALUE,
        SUPABASE_SECRET_KEY: SECRET_VALUE,
      }),
    ).toEqual(["NEXT_PUBLIC_OOPS"]);
  });
});
