/**
 * Request timeouts for server-side Supabase clients.
 *
 * Without them, a stopped or hanging upstream (e.g. PostgREST behind Kong)
 * keeps a page render waiting for 30 s or more. With them, every request
 * fails after a bounded time and surfaces as a normal Supabase error:
 * PostgREST returns `{ error }` (→ MembershipsUnavailableError), Auth returns
 * an AuthRetryableFetchError (→ AuthUnavailableError / "signed out" in the
 * proxy). Nothing here grants access.
 *
 * No `server-only` import: the proxy uses this module too.
 */

/** Per HTTP request (headers and body) to Supabase Auth / Data API. */
export const SUPABASE_REQUEST_TIMEOUT_MS = 6_000;

/**
 * Upper bound for a whole Auth call such as getUser() / getClaims().
 * Needed in addition to the per-request timeout because auth-js retries a
 * failed token refresh with backoff for up to 30 s.
 */
export const SUPABASE_AUTH_DEADLINE_MS = 7_000;

/** Safe log code. Never log URLs (may carry tokens), headers, cookies or bodies. */
export const REQUEST_TIMEOUT_LOG = "[supabase] request_timeout";
export const AUTH_DEADLINE_LOG = "[supabase] auth_deadline_exceeded";

type SupabaseService = "auth" | "rest" | "storage" | "functions" | "other";

/** Only the service name from the URL path, never the URL itself. */
function serviceOf(input: RequestInfo | URL): SupabaseService {
  let pathname = "";
  try {
    const href =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    pathname = new URL(href).pathname;
  } catch {
    return "other";
  }
  if (pathname.startsWith("/auth/")) return "auth";
  if (pathname.startsWith("/rest/")) return "rest";
  if (pathname.startsWith("/storage/")) return "storage";
  if (pathname.startsWith("/functions/")) return "functions";
  return "other";
}

/**
 * Wraps `fetch` so each request is aborted after `timeoutMs`, merged with any
 * signal the caller passed. Equivalent to `AbortSignal.timeout()` (the abort
 * reason is a `TimeoutError` DOMException), but built on `setTimeout` so tests
 * can drive it with fake timers. The timer keeps running after the response
 * headers arrive, so a body that stalls is aborted too.
 *
 * `fetchImpl` defaults to the global fetch, resolved per call.
 */
export function createTimeoutFetch(
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): typeof fetch {
  const timeoutMs = options.timeoutMs ?? SUPABASE_REQUEST_TIMEOUT_MS;

  return async (input, init) => {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort(new DOMException("request_timeout", "TimeoutError"));
    }, timeoutMs);
    // Don't keep a Node process alive just for this timer.
    (timer as { unref?: () => void }).unref?.();

    const callerSignal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, controller.signal])
      : controller.signal;

    try {
      return await fetchImpl(input, { ...init, signal });
    } catch (error) {
      clearTimeout(timer);
      if (controller.signal.aborted && !callerSignal?.aborted) {
        console.error(REQUEST_TIMEOUT_LOG, { service: serviceOf(input), timeoutMs });
      }
      throw error;
    }
  };
}

/** Options shared by every server-side Supabase client. */
export function serverClientRequestOptions() {
  return {
    global: { fetch: createTimeoutFetch() },
    // postgrest-js retries failed GETs with 1 s / 2 s / 4 s backoff, which
    // would multiply the timeout. Server renders fail fast instead; the user
    // retries from the error boundary ("Pokušaj ponovo").
    db: { retry: false },
  } as const;
}

/** Thrown by withAuthDeadline() when the Auth call took too long. */
export class AuthDeadlineExceededError extends Error {
  constructor() {
    super("auth_deadline_exceeded");
    this.name = "AuthDeadlineExceededError";
  }
}

/**
 * Resolves with `promise`, or rejects with AuthDeadlineExceededError after
 * `deadlineMs`. The underlying call is left to finish in the background
 * (auth-js offers no way to cancel its refresh retries); its result is ignored.
 */
export async function withAuthDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number = SUPABASE_AUTH_DEADLINE_MS,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      console.error(AUTH_DEADLINE_LOG, { deadlineMs });
      reject(new AuthDeadlineExceededError());
    }, deadlineMs);
  });
  // A late rejection of the abandoned call must not become unhandled.
  promise.catch(() => undefined);
  try {
    return await Promise.race([promise, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
