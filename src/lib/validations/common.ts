import { z } from "zod";

import { validationMessages } from "./messages";

/**
 * Reusable Zod building blocks for forms. Domain schemas (clients, jobs,
 * quotes...) will compose these in later phases.
 */

/** Trimmed, non-empty string with an optional maximum length. */
export function requiredText(max = 200) {
  return z
    .string({ error: validationMessages.required })
    .trim()
    .min(1, { error: validationMessages.required })
    .max(max, { error: validationMessages.tooLong(max) });
}

export const emailField = z
  .string({ error: validationMessages.required })
  .trim()
  .min(1, { error: validationMessages.required })
  .pipe(z.email({ error: validationMessages.invalidEmail }));

/**
 * Loose phone check: optional leading "+", then digits with optional
 * spaces, slashes or dashes; 6-15 digits in total (E.164 upper bound).
 * Accepts local ("064 123 4567") and international ("+381 64 1234567") forms.
 */
export const phoneField = z
  .string({ error: validationMessages.required })
  .trim()
  .min(1, { error: validationMessages.required })
  .refine(
    (value) => {
      if (!/^\+?[\d\s/-]+$/.test(value)) return false;
      const digits = value.replace(/\D/g, "");
      return digits.length >= 6 && digits.length <= 15;
    },
    { error: validationMessages.invalidPhone },
  );
