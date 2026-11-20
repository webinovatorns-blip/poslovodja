import "server-only";

import { parsePublicEnv, parseSiteUrl } from "@/lib/env";
import { findLeakedPublicSecrets, parseServerEnv } from "@/lib/env.server";

/**
 * Logs configuration problems at server start. Secrets exposed through a
 * NEXT_PUBLIC_ variable abort startup in every environment; missing values
 * are only warned about in development.
 */
export function reportEnvProblems(logger: Pick<Console, "warn"> = console) {
  const leaked = findLeakedPublicSecrets();
  if (leaked.length > 0) {
    throw new Error(
      `Secret Supabase key found in browser-exposed variable(s): ${leaked.join(", ")}. ` +
        "Move it to SUPABASE_SECRET_KEY and rotate the key.",
    );
  }

  if (process.env.NODE_ENV !== "development") return;

  const problems = [parsePublicEnv(), parseSiteUrl(), parseServerEnv()].flatMap(
    (result) => (result.success ? [] : result.problems),
  );
  if (problems.length === 0) return;

  logger.warn(
    [
      "[poslovodja] Supabase is not fully configured:",
      ...problems.map((p) => `  - ${p.variable}: ${p.reason}`),
      "  Copy .env.example to .env.local (see README.md, 'Local Supabase').",
    ].join("\n"),
  );
}
