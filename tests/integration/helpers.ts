import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { inject } from "vitest";

import type { Database } from "@/types/database";

export type TypedClient = SupabaseClient<Database>;

export const PASSWORD = "integration-test-password-123";

const config = () => inject("supabase");

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export function adminClient(): TypedClient {
  const { url, secretKey } = config();
  return createClient<Database>(url, secretKey, clientOptions);
}

export function anonClient(): TypedClient {
  const { url, publishableKey } = config();
  return createClient<Database>(url, publishableKey, clientOptions);
}

export function uniqueEmail(label: string): string {
  return `${label}-${crypto.randomUUID().slice(0, 8)}@integration.test`;
}

export type TestUser = {
  id: string;
  email: string;
  client: TypedClient;
  accessToken: string;
};

/** Creates a confirmed user through the Auth admin API and signs them in. */
export async function createSignedInUser(
  label: string,
  metadata: Record<string, unknown> = {},
): Promise<TestUser> {
  const email = uniqueEmail(label);
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: metadata,
  });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");

  const client = anonClient();
  const { data: session, error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError || !session.session) throw signInError ?? new Error("no session");

  return { id: data.user.id, email, client, accessToken: session.session.access_token };
}

/** Raw HTTP call to PostgREST - no supabase-js, no app code involved. */
export async function rawRest(
  path: string,
  init: RequestInit & { accessToken?: string } = {},
): Promise<Response> {
  const { url, publishableKey } = config();
  const headers = new Headers(init.headers);
  headers.set("apikey", publishableKey);
  headers.set("Content-Type", "application/json");
  if (init.accessToken) headers.set("Authorization", `Bearer ${init.accessToken}`);
  return fetch(`${url}/rest/v1/${path}`, { ...init, headers });
}
