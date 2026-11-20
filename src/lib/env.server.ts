import "server-only";

import { z } from "zod";

import {
  describeIssues,
  EnvValidationError,
  isPublishableSupabaseKey,
  isSecretSupabaseKey,
} from "@/lib/env-shared";

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: z
    .string({ error: "is missing" })
    .min(1, { error: "is missing" })
    .refine((key) => !isPublishableSupabaseKey(key), {
      error: "is a publishable/anon key. Use the secret (service_role) key here",
    }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

/** Validates server-only secrets. Pure: does not throw. */
export function parseServerEnv() {
  const result = serverEnvSchema.safeParse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY || undefined,
  });
  return result.success
    ? ({ success: true, data: result.data } as const)
    : ({ success: false, problems: describeIssues(result.error.issues) } as const);
}

/**
 * Names of NEXT_PUBLIC_* variables that hold a secret Supabase key.
 * Anything prefixed NEXT_PUBLIC_ is bundled into browser JavaScript.
 */
export function findLeakedPublicSecrets(
  env: Record<string, string | undefined> = process.env,
): string[] {
  return Object.entries(env)
    .filter(
      ([name, value]) =>
        name.startsWith("NEXT_PUBLIC_") && !!value && isSecretSupabaseKey(value),
    )
    .map(([name]) => name);
}

/** Returns validated server secrets or throws (names only, never values). */
export function getServerEnv(): ServerEnv {
  const result = parseServerEnv();
  if (!result.success) {
    throw new EnvValidationError("server", result.problems);
  }
  return result.data;
}
