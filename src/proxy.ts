import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { decideProxyRoute, isProtectedPath } from "@/lib/auth/route-rules";
import { parsePublicEnv } from "@/lib/env";
import {
  serverClientRequestOptions,
  withAuthDeadline,
} from "@/lib/supabase/request-timeout";
import type { Database } from "@/types/database";

/**
 * Next.js 16 Proxy (formerly middleware). Runs before every page request:
 *
 * 1. Refreshes the Supabase session and writes rotated auth cookies
 *    (httpOnly-capable cookies managed by @supabase/ssr; nothing in localStorage).
 * 2. Optimistic route protection with real HTTP redirects:
 *    signed-out → /login?next=…, signed-in on /login|/register → /auth/continue.
 *    If Auth can't be reached in time, the visitor is treated as signed out
 *    (see SUPABASE_AUTH_DEADLINE_MS).
 * 3. Private pages get `Cache-Control: no-store`, so after sign-out the
 *    browser can't show them from cache (back button).
 *
 * This is NOT the only check: server guards (src/lib/auth/session.ts)
 * re-validate the user and organization on every render, and RLS protects
 * the data itself.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  let isAuthenticated = false;

  const env = parsePublicEnv();
  if (env.success) {
    const supabase = createServerClient<Database>(
      env.data.NEXT_PUBLIC_SUPABASE_URL,
      env.data.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      {
        ...serverClientRequestOptions(),
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet, headers) {
            for (const { name, value } of cookiesToSet) {
              request.cookies.set(name, value);
            }
            response = NextResponse.next({ request });
            for (const { name, value, options } of cookiesToSet) {
              response.cookies.set(name, value, options);
            }
            for (const [key, value] of Object.entries(headers)) {
              response.headers.set(key, value);
            }
          },
        },
      },
    );

    // Validates the JWT (and refreshes it when expired). Don't run other
    // code between client creation and this call (see @supabase/ssr docs).
    // Fails closed: an error, timeout or exceeded deadline (Auth down) means
    // "not authenticated". That can't loop: signed-out visitors aren't
    // redirected away from /login, and the session cookies are kept.
    try {
      const { data, error } = await withAuthDeadline(supabase.auth.getClaims());
      isAuthenticated = !error && typeof data?.claims?.sub === "string";
    } catch {
      isAuthenticated = false;
    }
  }

  const { pathname, search } = request.nextUrl;
  const decision = decideProxyRoute({ pathname, search, isAuthenticated });

  if (decision.type === "redirect") {
    const redirectResponse = NextResponse.redirect(
      new URL(decision.location, request.url),
    );
    // Keep refreshed session cookies on the redirect.
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    redirectResponse.headers.set("Cache-Control", "private, no-store");
    return redirectResponse;
  }

  if (isProtectedPath(pathname) || pathname.startsWith("/auth/")) {
    response.headers.set("Cache-Control", "private, no-store");
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image optimization.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
