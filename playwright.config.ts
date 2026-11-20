import { defineConfig, devices } from "@playwright/test";

import { detectLocalSupabase } from "./tests/e2e/support/local-supabase";

const PORT = Number(process.env.PORT ?? 3100);
const baseURL = `http://localhost:${PORT}`;

/**
 * E2E tests run against a production build (`next build && next start`).
 * Set PLAYWRIGHT_SKIP_BUILD=1 to reuse an existing build (it must have been
 * built with the same NEXT_PUBLIC_* values).
 *
 * - smoke.spec.ts: public pages + route protection; no Supabase needed.
 * - auth-flow / app-shell specs: need the local Supabase stack
 *   (`npm run db:start`); they're skipped with a visible reason otherwise.
 */
const supabase = detectLocalSupabase();
if (supabase) {
  // Shared with the test workers (they create users through the admin API).
  process.env.E2E_SUPABASE_URL = supabase.apiUrl;
  process.env.E2E_SUPABASE_PUBLISHABLE_KEY = supabase.publishableKey;
  process.env.E2E_SUPABASE_SECRET_KEY = supabase.secretKey;
  process.env.E2E_MAILPIT_URL = supabase.mailpitUrl;
}

const appEnv: Record<string, string> = supabase
  ? {
      NEXT_PUBLIC_SUPABASE_URL: supabase.apiUrl,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
      NEXT_PUBLIC_SITE_URL: baseURL,
    }
  : { NEXT_PUBLIC_SITE_URL: baseURL };

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "off",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /auth-flow\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile",
      testIgnore: /auth-flow\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      // Full sign-up → confirm → onboarding → dashboard → sign-out flow.
      name: "auth-flow",
      testMatch: /auth-flow\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: process.env.PLAYWRIGHT_SKIP_BUILD
      ? `npx next start -p ${PORT}`
      : `npx next build && npx next start -p ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: appEnv,
  },
});
