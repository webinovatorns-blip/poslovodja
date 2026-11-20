import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { routes } from "@/config/navigation";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { resolvePostAuthPath } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Sends a signed-in user to the right place with a real HTTP redirect:
 * no organization → /onboarding, several → /select-organization,
 * otherwise the (safe, internal) `next` or /dashboard.
 * The proxy routes signed-in visits to /login and /register here.
 */
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next");

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    redirect(routes.login);
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    // The cookie still holds a well-formed token, but Supabase Auth rejects it
    // (e.g. the user was deleted). Clear it, otherwise the proxy would keep
    // sending /login back here (redirect loop).
    await supabase.auth.signOut({ scope: "local" });
    redirect(`${routes.login}?error=session_expired`);
  }

  redirect(
    await resolvePostAuthPath(
      supabase,
      data.user.id,
      next ? safeRedirectPath(next) : null,
    ),
  );
}
