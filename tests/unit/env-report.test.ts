import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { reportEnvProblems } from "@/lib/env-report";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("reportEnvProblems", () => {
  it("warns in development with variable names only", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    const warn = vi.fn();

    reportEnvProblems({ warn });

    expect(warn).toHaveBeenCalledOnce();
    const message = String(warn.mock.calls[0][0]);
    expect(message).toContain("NEXT_PUBLIC_SUPABASE_URL: is missing");
    expect(message).toContain("SUPABASE_SECRET_KEY: is missing");
    expect(message).toContain("NEXT_PUBLIC_SITE_URL: is missing");
  });

  it("stays silent when everything is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_x");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_x");
    const warn = vi.fn();
    reportEnvProblems({ warn });
    expect(warn).not.toHaveBeenCalled();
  });

  it("refuses to start when a secret is exposed via NEXT_PUBLIC_", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_LEAKED_KEY", "sb_secret_leaked-value");
    expect(() => reportEnvProblems({ warn: vi.fn() })).toThrow(/NEXT_PUBLIC_LEAKED_KEY/);
    expect(() => reportEnvProblems({ warn: vi.fn() })).not.toThrow(/leaked-value/);
  });
});
