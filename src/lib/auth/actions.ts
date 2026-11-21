"use server";

import { redirect } from "next/navigation";

import { withBasePath } from "@/config/base-path";
import { getTurnstileSiteKey } from "@/config/captcha";
import { routes } from "@/config/navigation";
import { getSiteUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ForgotPasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from "@/lib/validations/auth";

import { fieldErrorsOf, type ActionResult } from "./action-result";
import { clearActiveOrganizationCookie } from "./cookies";
import { authErrorMessage } from "./errors";
import { authMessages } from "./messages";
import { safeRedirectPath } from "./redirects";
import { getAuthUser, resolvePostAuthPath } from "./session";

/**
 * Auth server actions. Every action re-validates input with the same Zod
 * schema as the form, talks to Supabase with the publishable key and the
 * user's cookies (RLS applies; the admin client is never used), and returns
 * only safe, mapped messages.
 *
 * `redirect()` is called outside try/catch on purpose: it throws.
 */

async function serverClient() {
  try {
    return await createSupabaseServerClient();
  } catch {
    return null;
  }
}

function captchaMissing(token: string | undefined): boolean {
  return Boolean(getTurnstileSiteKey() && !token);
}

function callbackUrl(next: string): string {
  return `${getSiteUrl()}${routes.authCallback}?next=${encodeURIComponent(next)}`;
}

export async function signUpAction(input: RegisterInput): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  }

  if (captchaMissing(parsed.data.captchaToken)) {
    return { ok: false, message: authMessages.captchaRequired };
  }

  const supabase = await serverClient();
  if (!supabase) return { ok: false, message: authMessages.configurationMissing };

  const { fullName, email, password } = parsed.data;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by the on_auth_user_created trigger (trimmed and clamped there).
      data: { full_name: fullName },
      emailRedirectTo: callbackUrl(routes.onboarding),
      ...(parsed.data.captchaToken ? { captchaToken: parsed.data.captchaToken } : {}),
    },
  });

  if (error) {
    // Don't reveal whether the address is registered.
    if (error.code === "user_already_exists" || error.code === "email_exists") {
      return { ok: true, message: authMessages.signUpCheckEmail };
    }
    if (error.code === "weak_password") {
      return { ok: false, fieldErrors: { password: authMessages.weakPassword } };
    }
    return { ok: false, message: authErrorMessage(error) };
  }

  if (data.session) {
    // Email confirmation is disabled: the user is signed in right away.
    redirect(withBasePath(routes.onboarding));
  }

  return { ok: true, message: authMessages.signUpCheckEmail };
}

export async function signInAction(input: LoginInput): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  }
  if (captchaMissing(parsed.data.captchaToken)) {
    return { ok: false, message: authMessages.captchaRequired };
  }

  const supabase = await serverClient();
  if (!supabase) return { ok: false, message: authMessages.configurationMissing };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
    ...(parsed.data.captchaToken
      ? { options: { captchaToken: parsed.data.captchaToken } }
      : {}),
  });

  if (error || !data.user) {
    return { ok: false, message: authErrorMessage(error) };
  }

  const destination = await resolvePostAuthPath(
    supabase,
    data.user.id,
    parsed.data.next ? safeRedirectPath(parsed.data.next) : null,
  );
  redirect(withBasePath(destination));
}

export async function requestPasswordResetAction(
  input: ForgotPasswordInput,
): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  }
  if (captchaMissing(parsed.data.captchaToken)) {
    return { ok: false, message: authMessages.captchaRequired };
  }

  const supabase = await serverClient();
  if (supabase) {
    // The result is ignored on purpose: the response must be identical
    // whether or not an account exists (no account enumeration).
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: callbackUrl(routes.resetPassword),
      ...(parsed.data.captchaToken ? { captchaToken: parsed.data.captchaToken } : {}),
    });
  }

  return { ok: true, message: authMessages.passwordResetSent };
}

export async function updatePasswordAction(
  input: ResetPasswordInput,
): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const supabase = await serverClient();
  if (!supabase) return { ok: false, message: authMessages.configurationMissing };

  // The recovery link established a session in /auth/callback.
  const auth = await getAuthUser(supabase);
  if (auth.status === "unavailable") {
    return { ok: false, message: authMessages.authUnavailable };
  }
  if (auth.status === "signed-out") {
    return { ok: false, message: authMessages.resetLinkInvalid };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "weak_password" || error.code === "same_password") {
      return { ok: false, fieldErrors: { password: authErrorMessage(error) } };
    }
    return { ok: false, message: authErrorMessage(error) };
  }

  redirect(
    withBasePath(await resolvePostAuthPath(supabase, auth.user.id, routes.dashboard)),
  );
}

export async function signOutAction(): Promise<void> {
  const supabase = await serverClient();
  if (supabase) {
    // "local": ends this browser's session (revokes its refresh token).
    await supabase.auth.signOut({ scope: "local" });
  }
  await clearActiveOrganizationCookie();
  redirect(withBasePath(`${routes.login}?signed_out=1`));
}
