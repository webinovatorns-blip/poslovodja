import { routes } from "@/config/navigation";

const INTERNAL_ORIGIN = "http://internal.invalid";

/**
 * Returns `value` only if it is a safe, same-origin, relative path;
 * otherwise `fallback`. Prevents open redirects via `?next=`.
 *
 * Rejected: absolute URLs (`https://evil.com`), protocol-relative URLs
 * (`//evil.com`), backslash tricks (`/\evil.com`), `javascript:` and other
 * schemes, control characters, and auth endpoints (to avoid loops).
 */
export function safeRedirectPath(
  value: unknown,
  fallback: string = routes.dashboard,
): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) {
    return fallback;
  }
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    return fallback;
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }

  let url: URL;
  try {
    url = new URL(value, INTERNAL_ORIGIN);
  } catch {
    return fallback;
  }
  if (url.origin !== INTERNAL_ORIGIN) {
    return fallback;
  }
  if (url.pathname === "/auth" || url.pathname.startsWith("/auth/")) {
    return fallback;
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
