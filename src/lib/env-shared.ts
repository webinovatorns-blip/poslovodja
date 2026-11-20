import type { z } from "zod";

/**
 * Error for missing/invalid configuration. The message lists variable NAMES
 * and a reason only - never values - so it is safe to log.
 */
export class EnvValidationError extends Error {
  readonly variables: string[];

  constructor(
    scope: "public" | "server",
    problems: { variable: string; reason: string }[],
  ) {
    const lines = problems.map((p) => `  - ${p.variable}: ${p.reason}`).join("\n");
    super(
      `Invalid ${scope} environment configuration:\n${lines}\n` +
        "Copy .env.example to .env.local and fill in the values (see README.md).",
    );
    this.name = "EnvValidationError";
    this.variables = problems.map((p) => p.variable);
  }
}

/** Converts Zod issues to name + reason pairs without echoing input values. */
export function describeIssues(issues: z.core.$ZodIssue[]) {
  return issues.map((issue) => ({
    variable: issue.path.join(".") || "(root)",
    reason:
      issue.code === "invalid_type" ? "is missing" : (issue.message ?? "is invalid"),
  }));
}

/** Reads the `role` claim of a legacy JWT API key, if it is one. */
function jwtRole(key: string): string | undefined {
  const parts = key.split(".");
  if (parts.length !== 3) return undefined;
  try {
    const json = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload: unknown = JSON.parse(json);
    if (payload && typeof payload === "object" && "role" in payload) {
      return String((payload as { role: unknown }).role);
    }
  } catch {
    // Not a JWT.
  }
  return undefined;
}

/** True for keys that bypass RLS: new `sb_secret_...` keys and legacy service_role JWTs. */
export function isSecretSupabaseKey(key: string): boolean {
  return key.startsWith("sb_secret_") || jwtRole(key) === "service_role";
}

/** True for keys that are safe to expose: `sb_publishable_...` and legacy anon JWTs. */
export function isPublishableSupabaseKey(key: string): boolean {
  return key.startsWith("sb_publishable_") || jwtRole(key) === "anon";
}
