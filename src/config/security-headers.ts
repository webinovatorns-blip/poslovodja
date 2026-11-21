/**
 * HTTP security headers for every response of this app.
 *
 * Applied via `headers()` in next.config.ts. Because the app uses `basePath`
 * (/poslovodja in production), Next.js prefixes the source automatically, so
 * these headers only affect this app, never other sites on the same domain
 * (e.g. webinovator.org/pops).
 *
 * Deliberately conservative:
 * - HSTS without includeSubDomains/preload: other subdomains of the domain
 *   are not ours to commit to HTTPS-only.
 * - CSP only restricts framing (clickjacking). A full script CSP needs nonces
 *   for Next.js inline scripts and must allow Cloudflare Turnstile; do that as
 *   a separate, tested change.
 */
export const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
] as const;
