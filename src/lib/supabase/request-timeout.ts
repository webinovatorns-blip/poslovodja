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
 * No `server-only` import: the proxy uses this module too. The browser
 * client (./client.ts) deliberately doesn't use it.
 */

/** Default per HTTP request (headers and body) to Supabase Auth / Data API. */
export const SUPABASE_REQUEST_TIMEOUT_MS = 6_000;

/**
 * Default upper bound for a whole Auth call such as getUser() / getClaims().
 * Needed in addition to the per-request timeout because auth-js retries a
 * failed token refresh with backoff for up to 30 s.
 */
export const SUPABASE_AUTH_DEADLINE_MS = 7_000;

/** Accepted range for the optional env overrides; anything else → default. */
export const SUPABASE_TIMEOUT_MIN_MS = 1_000;
export const SUPABASE_TIMEOUT_MAX_MS = 30_000;

/** Safe log codes. Never log URLs (may carry tokens), headers, cookies or bodies. */
export const REQUEST_TIMEOUT_LOG = "[supabase] request_timeout";
export const AUTH_DEADLINE_LOG = "[supabase] auth_deadline_exceeded";
export const INVALID_TIMEOUT_SETTING_LOG = "[supabase] invalid_timeout_setting";

type TimeoutSetting = "SUPABASE_REQUEST_TIMEOUT_MS" | "SUPABASE_AUTH_DEADLINE_MS";

const reportedInvalidSettings = new Set<TimeoutSetting>();

/**
 * Reads an optional server-side override (whole milliseconds within
 * [SUPABASE_TIMEOUT_MIN_MS, SUPABASE_TIMEOUT_MAX_MS]). Unset → default.
 * Invalid → default, with a one-time warning naming only the variable.
 */
function timeoutSetting(name: TimeoutSetting, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
  if (value >= SUPABASE_TIMEOUT_MIN_MS && value <= SUPABASE_TIMEOUT_MAX_MS) {
    return value;
  }
  if (!reportedInvalidSettings.has(name)) {
    reportedInvalidSettings.add(name);
    console.warn(INVALID_TIMEOUT_SETTING_LOG, { name, usingMs: fallback });
  }
  return fallback;
}

/** Effective per-request timeout (env `SUPABASE_REQUEST_TIMEOUT_MS`, default 6 s). */
export function getRequestTimeoutMs(): number {
  return timeoutSetting("SUPABASE_REQUEST_TIMEOUT_MS", SUPABASE_REQUEST_TIMEOUT_MS);
}

/** Effective Auth deadline (env `SUPABASE_AUTH_DEADLINE_MS`, default 7 s). */
export function getAuthDeadlineMs(): number {
  return timeoutSetting("SUPABASE_AUTH_DEADLINE_MS", SUPABASE_AUTH_DEADLINE_MS);
}

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
 * Wraps `fetch` so each request is aborted after the timeout, merged with
 * any signal the caller passed. Equivalent to `AbortSignal.timeout()` (the
 * abort reason is a `TimeoutError` DOMException), but built on `setTimeout`
 * so it can be cleared, and tests can drive it with fake timers.
 *
 * The timeout also covers reading the response body. The timer and the
 * listener on the caller's signal are removed exactly once, when the first
 * of these happens: the body is fully read, the body is cancelled or errors,
 * the response has no body, the fetch rejects, the caller aborts, or the
 * timeout fires.
 *
 * `fetchImpl` defaults to the global fetch, resolved per call.
 */
export function createTimeoutFetch(
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): typeof fetch {
  return async (input, init) => {
    const timeoutMs = options.timeoutMs ?? getRequestTimeoutMs();
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    const callerSignal =
      init?.signal ?? (input instanceof Request ? input.signal : undefined);

    const controller = new AbortController();
    let timedOut = false;
    let cleanedUp = false;

    const onCallerAbort = () => {
      cleanup();
      controller.abort(callerSignal?.reason);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      cleanup();
      controller.abort(new DOMException("request_timeout", "TimeoutError"));
    }, timeoutMs);
    // Don't keep a Node process alive just for this timer.
    (timer as { unref?: () => void }).unref?.();

    function cleanup() {
      if (cleanedUp) return;
      cleanedUp = true;
      clearTimeout(timer);
      callerSignal?.removeEventListener("abort", onCallerAbort);
    }

    if (callerSignal?.aborted) {
      onCallerAbort();
    } else {
      callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
    }

    let response: Response;
    try {
      response = await fetchImpl(input, { ...init, signal: controller.signal });
    } catch (error) {
      cleanup();
      if (timedOut) {
        console.error(REQUEST_TIMEOUT_LOG, { service: serviceOf(input), timeoutMs });
      }
      throw error;
    }

    if (!response.body) {
      cleanup();
      return response;
    }

    // Pass the body through unchanged, but learn when it ends. If the timer
    // fires mid-body, the aborted signal errors the source stream.
    const reader = response.body.getReader();
    const body = new ReadableStream<Uint8Array>({
      async pull(stream) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            cleanup();
            stream.close();
          } else {
            stream.enqueue(value);
          }
        } catch (error) {
          cleanup();
          stream.error(error);
        }
      },
      async cancel(reason) {
        cleanup();
        await reader.cancel(reason);
      },
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
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
 * the deadline. The timer is cleared as soon as either side settles. The
 * underlying call is left to finish in the background (auth-js offers no way
 * to cancel its refresh retries); its result is ignored.
 */
export async function withAuthDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number = getAuthDeadlineMs(),
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
