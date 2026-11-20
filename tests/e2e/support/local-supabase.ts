import { execFileSync } from "node:child_process";

export type LocalSupabase = {
  apiUrl: string;
  publishableKey: string;
  secretKey: string;
  mailpitUrl: string;
};

/**
 * Connection details of the LOCAL Supabase stack, or null if it isn't
 * running. Explicit env vars win; otherwise `supabase status` is used.
 * Non-local URLs are refused: these tests create and delete users.
 */
export function detectLocalSupabase(): LocalSupabase | null {
  let apiUrl = process.env.SUPABASE_TEST_URL;
  let publishableKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
  let secretKey = process.env.SUPABASE_TEST_SECRET_KEY;
  let mailpitUrl = process.env.SUPABASE_TEST_MAILPIT_URL;

  if (!apiUrl || !publishableKey || !secretKey) {
    try {
      const output = execFileSync("npx", ["supabase", "status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 60_000,
      });
      const status = JSON.parse(output.slice(output.indexOf("{"))) as Record<
        string,
        string
      >;
      apiUrl = status.API_URL;
      publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
      secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
      mailpitUrl ??= status.MAILPIT_URL ?? status.INBUCKET_URL;
    } catch {
      return null;
    }
  }

  if (!apiUrl || !publishableKey || !secretKey) return null;

  const host = new URL(apiUrl).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`Refusing to run E2E tests against non-local Supabase (${host}).`);
  }

  return {
    apiUrl,
    publishableKey,
    secretKey,
    mailpitUrl: mailpitUrl ?? "http://127.0.0.1:54324",
  };
}
