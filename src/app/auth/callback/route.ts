import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { routes } from "@/config/navigation";
import { callbackUnavailableResponse } from "@/lib/auth/callback-unavailable";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { callAuth, resolvePostAuthPath } from "@/lib/auth/session";
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
 * fixed error key, never the upstream error text:
 * - Auth answered "no" (invalid, expired or already used code/token, missing
 *   PKCE verifier) → `?error=link_invalid` / `reset_link_invalid`.
 * - Auth didn't answer (timeout, network error, 5xx) → a 503 page served in
 *   place with "Pokušaj ponovo", which repeats this request. auth-js deletes
 *   the PKCE verifier cookie after any failed exchange, so it's restored
 *   here; otherwise the retry could only fail as "link invalid".
 */

/** @supabase/ssr's PKCE verifier cookies (single key, per-flow slots, flow index). */
const isPkceVerifierCookie = (name: string) => name.includes("-code-verifier");

/** Same attributes @supabase/ssr writes its auth cookies with (DEFAULT_COOKIE_OPTIONS). */
const verifierCookieOptions = {
  path: "/",
  sameSite: "lax",
  httpOnly: false,
  maxAge: 400 * 24 * 60 * 60,
} as const;
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

  const cookieStore = await cookies();
  const verifierCookies = cookieStore
    .getAll()
    .filter((cookie) => isPkceVerifierCookie(cookie.name));

  let userId: string | null = null;

  if (code) {
    const call = await callAuth(supabase.auth.exchangeCodeForSession(code));
    if (call.unavailable) {
      // Put the verifier back (a later set of the same name wins) so that
      // "Pokušaj ponovo" can complete the same exchange.
      for (const { name, value } of verifierCookies) {
        cookieStore.set(name, value, verifierCookieOptions);
      }
      return callbackUnavailableResponse();
    }
    const { data, error } = call.result;
    userId = error ? null : (data.user?.id ?? null);
  } else if (tokenHash && type && otpTypes.has(type)) {
    const call = await callAuth(supabase.auth.verifyOtp({ type, token_hash: tokenHash }));
    if (call.unavailable) {
      return callbackUnavailableResponse();
    }
    const { data, error } = call.result;
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
