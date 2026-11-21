/** Public Cloudflare Turnstile site key, inlined into the browser bundle. */
export function getTurnstileSiteKey(): string | null {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;
}
