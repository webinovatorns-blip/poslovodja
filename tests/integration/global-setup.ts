import { execFileSync } from "node:child_process";

import type { TestProject } from "vitest/node";

export type LocalSupabase = {
  url: string;
  publishableKey: string;
  secretKey: string;
};

declare module "vitest" {
  export interface ProvidedContext {
    supabase: LocalSupabase;
  }
}

/**
 * Resolves connection details for the LOCAL Supabase stack: explicit env
 * vars first, otherwise `supabase status`. Refuses non-local URLs because
 * these tests create and delete users.
 */
export default function setup(project: TestProject) {
  let url = process.env.SUPABASE_TEST_URL;
  let publishableKey = process.env.SUPABASE_TEST_PUBLISHABLE_KEY;
  let secretKey = process.env.SUPABASE_TEST_SECRET_KEY;

  if (!url || !publishableKey || !secretKey) {
    let status: Record<string, string>;
    try {
      const output = execFileSync("npx", ["supabase", "status", "-o", "json"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      status = JSON.parse(output.slice(output.indexOf("{")));
    } catch {
      throw new Error(
        "Local Supabase is not running. Start it with `npm run db:start` " +
          "(or set SUPABASE_TEST_URL, SUPABASE_TEST_PUBLISHABLE_KEY, SUPABASE_TEST_SECRET_KEY).",
      );
    }
    url = status.API_URL;
    publishableKey = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
    secretKey = status.SECRET_KEY ?? status.SERVICE_ROLE_KEY;
  }

  const host = new URL(url).hostname;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(
      `Refusing to run integration tests against non-local Supabase (${host}).`,
    );
  }

  project.provide("supabase", { url, publishableKey, secretKey });
}
