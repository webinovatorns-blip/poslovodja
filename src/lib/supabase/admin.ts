import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env";
import { getServerEnv } from "@/lib/env.server";
import type { Database } from "@/types/database";

/**
 * Supabase client with the SECRET (service_role) key. It BYPASSES RLS.
 *
 * - Server-only: the `server-only` import makes any client-bundle import a
 *   build error, and ESLint forbids importing it from UI components.
 * - Never forward user input into it without your own authorization check.
 * - Prefer createSupabaseServerClient() (acts as the user, RLS applies).
 * - Not used by the app yet; intended for trusted jobs (e.g. sending
 *   invitation emails, maintenance).
 */
export function createSupabaseAdminClient() {
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  const { SUPABASE_SECRET_KEY } = getServerEnv();

  return createClient<Database>(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
