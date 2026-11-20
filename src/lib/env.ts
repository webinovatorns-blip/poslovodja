import { z } from "zod";

import {
  describeIssues,
  EnvValidationError,
  isSecretSupabaseKey,
} from "@/lib/env-shared";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({
    protocol: /^https?$/,
    error: "must be an http(s) URL",
  }),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: "is missing" })
    .min(1, { error: "is missing" })
    .refine((key) => !isSecretSupabaseKey(key), {
      error:
        "is a SECRET/service_role key. Use the publishable (anon) key here - secret keys bypass RLS and must never reach the browser",
    }),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

/**
 * Validates values that are safe for the browser. Pure: does not throw.
 * `process.env.NEXT_PUBLIC_*` must be referenced literally so Next.js can
 * inline the values into the client bundle.
 */
export function parsePublicEnv() {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || undefined,
  });
  return result.success
    ? ({ success: true, data: result.data } as const)
    : ({ success: false, problems: describeIssues(result.error.issues) } as const);
}

/**
 * Returns the validated public env or throws an EnvValidationError naming
 * the missing variables (never their values). Called lazily, when a Supabase
 * client is created, so pages that don't need Supabase keep working.
 */
export function getPublicEnv(): PublicEnv {
  const result = parsePublicEnv();
  if (!result.success) {
    throw new EnvValidationError("public", result.problems);
  }
  return result.data;
}
