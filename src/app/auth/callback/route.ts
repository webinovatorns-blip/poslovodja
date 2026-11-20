import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { routes } from "@/config/navigation";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { resolvePostAuthPath } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const otpTypes = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

/**
 * Supabase auth callback: email confirmation, password recovery, magic links
 * and other PKCE flows.
 *
 * - `?code=` (PKCE)               → exchangeCodeForSession
 * - `?token_hash=&type=` (OTP)    → verifyOtp (works across devices)
 * - `?next=` must be an internal path (safeRedirectPath)
 *
 * Codes and tokens are never logged or echoed. Failures redirect with a
 * fixed error key, never the upstream error text.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeRedirectPath(params.get("next"), routes.dashboard);
  const nextPath = next.split(/[?#]/)[0];
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const isRecovery = type === "recovery" || nextPath === routes.resetPassword;

  const failure = isRecovery
    ? `${routes.forgotPassword}?error=reset_link_invalid`
    : `${routes.login}?error=link_invalid`;

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect(failure);
  }

  let userId: string | null = null;

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    userId = error ? null : (data.user?.id ?? null);
  } else if (tokenHash && type && otpTypes.has(type)) {
    const { data, error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    userId = error ? null : (data.user?.id ?? null);
  }

  if (!userId) {
    redirect(failure);
  }

  if (isRecovery) {
    redirect(routes.resetPassword);
  }

  redirect(await resolvePostAuthPath(supabase, userId, next));
}
