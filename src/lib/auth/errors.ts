import { authMessages } from "./messages";

/**
 * Stable digest of MembershipsUnavailableError. Next.js keeps a digest that
 * is already set on a thrown error, so error boundaries can recognize this
 * error in production too (where server error messages are stripped).
 */
export const MEMBERSHIPS_UNAVAILABLE_DIGEST = "MEMBERSHIPS_UNAVAILABLE";

/**
 * Reading the user's memberships failed (database / Data API error).
 * Different from "the user has no memberships": callers must never treat it
 * as that, i.e. never send the user to onboarding because of it.
 * Carries no upstream message, SQL detail or identifiers.
 */
export class MembershipsUnavailableError extends Error {
  readonly digest = MEMBERSHIPS_UNAVAILABLE_DIGEST;

  constructor() {
    super("memberships_unavailable");
    this.name = "MembershipsUnavailableError";
  }
}

export function isMembershipsUnavailableError(error: unknown): boolean {
  return (
    error instanceof MembershipsUnavailableError ||
    (typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      (error as { digest?: unknown }).digest === MEMBERSHIPS_UNAVAILABLE_DIGEST)
  );
}

/** Stable digest of AuthUnavailableError (see MEMBERSHIPS_UNAVAILABLE_DIGEST). */
export const AUTH_UNAVAILABLE_DIGEST = "AUTH_UNAVAILABLE";

/**
 * Supabase Auth could not be reached in time (timeout, network error or a
 * 5xx from the gateway), so we don't know whether the session is valid.
 * Fails closed: no access is granted, but the user isn't signed out either;
 * the root error boundary offers a retry. Carries no upstream detail.
 */
export class AuthUnavailableError extends Error {
  readonly digest = AUTH_UNAVAILABLE_DIGEST;

  constructor() {
    super("auth_unavailable");
    this.name = "AuthUnavailableError";
  }
}

export function isAuthUnavailableError(error: unknown): boolean {
  return (
    error instanceof AuthUnavailableError ||
    (typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      (error as { digest?: unknown }).digest === AUTH_UNAVAILABLE_DIGEST)
  );
}

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
