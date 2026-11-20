import { z } from "zod";

import { emailField, requiredText } from "./common";
import { validationMessages } from "./messages";

/**
 * Auth schemas shared by the client forms (React Hook Form + zodResolver)
 * and the server actions (which re-validate every request).
 *
 * Keep PASSWORD_MIN_LENGTH in sync with `minimum_password_length` in
 * supabase/config.toml (and the hosted project's Auth settings).
 */
export const PASSWORD_MIN_LENGTH = 10;
/** bcrypt (used by Supabase Auth) ignores input beyond 72 bytes. */
export const PASSWORD_MAX_LENGTH = 72;

export const passwordField = z
  .string({ error: validationMessages.required })
  .min(PASSWORD_MIN_LENGTH, {
    error: validationMessages.passwordTooShort(PASSWORD_MIN_LENGTH),
  })
  .refine((value) => new TextEncoder().encode(value).length <= PASSWORD_MAX_LENGTH, {
    error: validationMessages.passwordTooLong(PASSWORD_MAX_LENGTH),
  });

export const registerSchema = z
  .object({
    fullName: requiredText(200),
    email: emailField,
    password: passwordField,
    confirmPassword: z.string({ error: validationMessages.required }),
    acceptTerms: z.boolean().refine((value) => value, {
      error: validationMessages.termsRequired,
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    error: validationMessages.passwordsDoNotMatch,
  });

export type RegisterInput = z.input<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailField,
  // Only presence is checked at login; strength rules apply when setting it.
  password: z.string({ error: validationMessages.required }).min(1, {
    error: validationMessages.required,
  }),
  next: z.string().optional(),
});

export type LoginInput = z.input<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailField,
});

export type ForgotPasswordInput = z.input<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string({ error: validationMessages.required }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ["confirmPassword"],
    error: validationMessages.passwordsDoNotMatch,
  });

export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;
