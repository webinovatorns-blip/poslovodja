import { authMessages } from "./messages";

/** Minimal shape of Supabase Auth / PostgREST errors we inspect. */
type ErrorLike =
  { code?: unknown; status?: unknown; message?: unknown } | null | undefined;

function codeOf(error: ErrorLike): string | undefined {
  return typeof error?.code === "string" ? error.code : undefined;
}

/**
 * Maps a Supabase Auth error to a safe Serbian message using only its CODE.
 * The original message (which may contain internal details) is never used.
 */
export function authErrorMessage(error: ErrorLike): string {
  switch (codeOf(error)) {
    case "invalid_credentials":
      return authMessages.invalidCredentials;
    case "email_not_confirmed":
      return authMessages.emailNotConfirmed;
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return authMessages.rateLimited;
    case "weak_password":
      return authMessages.weakPassword;
    case "same_password":
      return authMessages.samePassword;
    case "session_not_found":
    case "refresh_token_not_found":
    case "bad_jwt":
      return authMessages.sessionExpired;
    default:
      return authMessages.generic;
  }
}

/** Maps errors from create_organization_with_details() to a safe message. */
export function organizationErrorMessage(error: ErrorLike): string {
  if (codeOf(error) === "42501") return authMessages.sessionExpired;
  return authMessages.organizationCreateFailed;
}
