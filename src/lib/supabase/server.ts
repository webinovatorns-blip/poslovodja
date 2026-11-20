import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/types/database";

import { serverClientRequestOptions } from "./request-timeout";

/**
 * Supabase client for Server Components, Server Functions and Route Handlers.
 * Acts as the signed-in user (session from cookies) with the publishable key,
 * so RLS applies exactly as in the browser. Reading cookies makes the
 * surrounding render dynamic.
 *
 * Every request has a timeout (see ./request-timeout.ts): an unreachable
 * upstream yields a normal `{ error }` instead of a hanging render.
 */
export async function createSupabaseServerClient() {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      ...serverClientRequestOptions(),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh will be handled in the proxy during the auth phase.
          }
        },
      },
    },
  );
}
