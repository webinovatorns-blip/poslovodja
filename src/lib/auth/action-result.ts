import type { z } from "zod";

/** Result returned by form server actions (successful redirects never return). */
export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; message?: string; fieldErrors?: Record<string, string> };

/** First error message per field, for showing next to inputs. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    fieldErrors[key] ??= issue.message;
  }
  return fieldErrors;
}
