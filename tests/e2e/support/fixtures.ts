import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "../../../src/types/database";

/**
 * Test-data helpers for E2E. The admin (secret) client is used ONLY to set up
 * and clean up fixtures; everything under test goes through the real UI.
 */

export const hasSupabase = () => Boolean(process.env.E2E_SUPABASE_URL);
export const SKIP_REASON =
  "Local Supabase is not running (start it with `npm run db:start`), so this flow can't be tested.";

export const PASSWORD = "e2e-test-lozinka-123";

export function admin() {
  return createClient<Database>(
    process.env.E2E_SUPABASE_URL!,
    process.env.E2E_SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function uniqueEmail(label: string) {
  return `${label}-${crypto.randomUUID().slice(0, 8)}@e2e.test`;
}

export async function createConfirmedUser(label: string, fullName: string) {
  const email = uniqueEmail(label);
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) throw error ?? new Error("createUser failed");
  return { id: data.user.id, email };
}

/** Fixture setup only (service role). The app itself uses the onboarding RPC. */
export async function createOrganizationFor(
  userId: string,
  name: string,
  options: {
    role?: Database["public"]["Enums"]["member_role"];
    status?: Database["public"]["Enums"]["membership_status"];
    /** Extra users created here are pushed so the caller can clean them up. */
    createdUsers?: string[];
  } = {},
) {
  const { role = "owner", status = "active", createdUsers } = options;
  const db = admin();
  const slug = `e2e-${crypto.randomUUID().slice(0, 12)}`;
  const { data, error } = await db
    .from("organizations")
    .insert({ name, slug })
    .select("id")
    .single();
  if (error || !data) throw error ?? new Error("organization insert failed");
  // A role other than owner still needs an owner for the org to be valid.
  if (role !== "owner") {
    const owner = await createConfirmedUser("owner", "Fixture Owner");
    createdUsers?.push(owner.id);
    await db.from("memberships").insert({
      organization_id: data.id,
      user_id: owner.id,
      role: "owner",
      status: "active",
    });
  }
  const membership = await db
    .from("memberships")
    .insert({ organization_id: data.id, user_id: userId, role, status });
  if (membership.error) throw membership.error;
  return data.id;
}

/** Deletes users and every organization they belong to (orgs first: last-owner rule). */
export async function cleanup(userIds: string[]) {
  const ids = userIds.filter(Boolean);
  if (ids.length === 0) return;
  const db = admin();
  const { data } = await db
    .from("memberships")
    .select("organization_id")
    .in("user_id", ids);
  const organizations = [...new Set((data ?? []).map((row) => row.organization_id))];
  if (organizations.length) {
    await db.from("organizations").delete().in("id", organizations);
  }
  for (const id of ids) {
    await db.auth.admin.deleteUser(id).catch(() => undefined);
  }
}

export async function userIdByEmail(email: string) {
  const { data } = await admin().auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((user) => user.email === email)?.id;
}

/** Latest auth email link sent to `email` (from Mailpit). */
export async function emailLink(
  email: string,
  subjectIncludes?: RegExp,
): Promise<string> {
  const base = process.env.E2E_MAILPIT_URL!;
  for (let attempt = 0; attempt < 40; attempt++) {
    const search = await fetch(
      `${base}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const { messages = [] } = (await search.json()) as {
      messages?: { ID: string; Subject: string }[];
    };
    const message = messages.find(
      (item) => !subjectIncludes || subjectIncludes.test(item.Subject),
    );
    if (message) {
      const detail = (await (
        await fetch(`${base}/api/v1/message/${message.ID}`)
      ).json()) as {
        Text: string;
      };
      const link = detail.Text.match(
        /https?:\/\/[^\s)]+\/auth\/v1\/verify\?[^\s)]+/,
      )?.[0];
      if (link) return link;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`No auth email for ${email}`);
}

/** The form's alert (Next.js also renders an empty role="alert" route announcer). */
export function formAlert(page: Page) {
  return page.locator('[role="alert"]:not(#__next-route-announcer__)');
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Prijavi se" }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Korisnički meni" }).click();
  await page.getByRole("menuitem", { name: "Odjava" }).click();
  await expect(page).toHaveURL(/\/login\?signed_out=1$/);
}
