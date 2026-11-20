/**
 * End-to-end checks against the real local Supabase stack (Auth + PostgREST).
 * Requests go straight to the Data API, bypassing the Next.js app, to prove
 * that RLS and grants hold for any client holding a valid key/JWT.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  adminClient,
  anonClient,
  createSignedInUser,
  rawRest,
  type TestUser,
} from "./helpers";

let ownerA: TestUser;
let workerA: TestUser;
let ownerB: TestUser;
let invitee: TestUser;
let orgA: string;
let orgB: string;

beforeAll(async () => {
  [ownerA, workerA, ownerB, invitee] = await Promise.all([
    createSignedInUser("owner-a", { full_name: "  Owner A  " }),
    createSignedInUser("worker-a", { full_name: "Worker A" }),
    createSignedInUser("owner-b", { full_name: "Owner B" }),
    createSignedInUser("invitee", { avatar_url: "javascript:alert(1)" }),
  ]);

  const suffix = crypto.randomUUID().slice(0, 8);
  const a = await ownerA.client.rpc("create_organization", {
    p_name: "Integracija A",
    p_slug: `integracija-a-${suffix}`,
  });
  const b = await ownerB.client.rpc("create_organization", {
    p_name: "Integracija B",
    p_slug: `integracija-b-${suffix}`,
  });
  if (a.error || b.error) throw a.error ?? b.error;
  orgA = a.data;
  orgB = b.data;

  // Worker joins A through the real invitation flow.
  const invitation = await ownerA.client.rpc("create_organization_invitation", {
    p_organization_id: orgA,
    p_email: workerA.email,
    p_role: "worker",
  });
  if (invitation.error) throw invitation.error;
  const accepted = await workerA.client.rpc("accept_organization_invitation", {
    p_token: invitation.data[0].token,
  });
  if (accepted.error) throw accepted.error;
});

afterAll(async () => {
  const admin = adminClient();
  // Organizations first: the last owner of an organization can't be deleted.
  if (orgA || orgB) {
    await admin.from("organizations").delete().in("id", [orgA, orgB].filter(Boolean));
  }
  for (const user of [ownerA, workerA, ownerB, invitee]) {
    if (user) await admin.auth.admin.deleteUser(user.id);
  }
});

describe("sign-up trigger (real Supabase Auth)", () => {
  it("creates a sanitized profile for users created through Auth", async () => {
    const { data, error } = await ownerA.client
      .from("profiles")
      .select("id, full_name, locale")
      .single();
    expect(error).toBeNull();
    expect(data).toEqual({ id: ownerA.id, full_name: "Owner A", locale: "sr-Latn" });

    const { data: inviteeProfile } = await invitee.client
      .from("profiles")
      .select("avatar_url")
      .single();
    expect(inviteeProfile?.avatar_url).toBeNull();
  });
});

describe("anonymous requests (publishable key, no user)", () => {
  it.each(["organizations", "memberships", "profiles", "organization_invitations"])(
    "cannot read %s",
    async (table) => {
      const response = await rawRest(`${table}?select=id`);
      expect(response.status).toBe(401);
      expect((await response.json()).code).toBe("42501");
    },
  );

  it("cannot call create_organization", async () => {
    const { error } = await anonClient().rpc("create_organization", {
      p_name: "Anon",
      p_slug: "anon-firma",
    });
    expect(error?.code).toBe("42501");
  });
});

describe("tenant isolation over raw HTTP", () => {
  it("user A sees organization A only", async () => {
    const response = await rawRest("organizations?select=id", {
      accessToken: ownerA.accessToken,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: orgA }]);
  });

  it("user A cannot read organization B even when asking for it by id", async () => {
    const response = await rawRest(`organizations?select=id&id=eq.${orgB}`, {
      accessToken: ownerA.accessToken,
    });
    expect(await response.json()).toEqual([]);
  });

  it("user A cannot see memberships of organization B", async () => {
    const response = await rawRest(`memberships?select=id&organization_id=eq.${orgB}`, {
      accessToken: ownerA.accessToken,
    });
    expect(await response.json()).toEqual([]);
  });

  it("user A cannot update organization B", async () => {
    const response = await rawRest(`organizations?id=eq.${orgB}`, {
      method: "PATCH",
      accessToken: ownerA.accessToken,
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ name: "Hijacked" }),
    });
    expect(await response.json()).toEqual([]);

    const { data } = await ownerB.client.from("organizations").select("name").single();
    expect(data?.name).toBe("Integracija B");
  });

  it("direct INSERT of an organization is rejected", async () => {
    const response = await rawRest("organizations", {
      method: "POST",
      accessToken: ownerA.accessToken,
      body: JSON.stringify({ name: "Direktno", slug: "direktno-kreirana" }),
    });
    expect(response.status).toBe(403);
  });

  it("direct INSERT of an owner membership into another org is rejected", async () => {
    const response = await rawRest("memberships", {
      method: "POST",
      accessToken: ownerA.accessToken,
      body: JSON.stringify({ organization_id: orgB, user_id: ownerA.id, role: "owner" }),
    });
    expect(response.status).toBe(403);
  });
});

describe("roles over the Data API", () => {
  it("worker cannot raise their own role", async () => {
    const { data } = await workerA.client
      .from("memberships")
      .update({ role: "owner" })
      .eq("organization_id", orgA)
      .eq("user_id", workerA.id)
      .select("role");
    expect(data).toEqual([]);

    const { data: membership } = await workerA.client
      .from("memberships")
      .select("role")
      .eq("organization_id", orgA)
      .eq("user_id", workerA.id)
      .single();
    expect(membership?.role).toBe("worker");
  });

  it("worker cannot change organization data", async () => {
    const { data } = await workerA.client
      .from("organizations")
      .update({ name: "Radnikova firma" })
      .eq("id", orgA)
      .select("id");
    expect(data).toEqual([]);
  });

  it("worker cannot invite", async () => {
    const { error } = await workerA.client.rpc("create_organization_invitation", {
      p_organization_id: orgA,
      p_email: invitee.email,
    });
    expect(error?.code).toBe("42501");
    expect(error?.message).toBe("insufficient_role");
  });

  it("the last owner cannot leave", async () => {
    const { error } = await ownerA.client
      .from("memberships")
      .delete()
      .eq("organization_id", orgA)
      .eq("user_id", ownerA.id);
    expect(error?.message).toBe("last_active_owner");
  });
});

describe("invitations over the Data API", () => {
  it("token hashes are never readable", async () => {
    const { error } = await ownerA.client
      .from("organization_invitations")
      .select("token_hash");
    expect(error?.code).toBe("42501");
  });

  it("invitations are single use", async () => {
    const created = await ownerA.client.rpc("create_organization_invitation", {
      p_organization_id: orgA,
      p_email: invitee.email.toUpperCase(),
      p_role: "manager",
    });
    expect(created.error).toBeNull();
    const token = created.data![0].token;
    expect(token).toMatch(/^[0-9a-f]{64}$/);

    // Another signed-in user can't redeem it.
    const stolen = await ownerB.client.rpc("accept_organization_invitation", {
      p_token: token,
    });
    expect(stolen.error?.message).toBe("invitation_invalid");

    const first = await invitee.client.rpc("accept_organization_invitation", {
      p_token: token,
    });
    expect(first.error).toBeNull();
    expect(first.data).toBe(orgA);

    const second = await invitee.client.rpc("accept_organization_invitation", {
      p_token: token,
    });
    expect(second.error?.message).toBe("invitation_invalid");

    const { data: orgs } = await invitee.client.from("organizations").select("id");
    expect(orgs).toEqual([{ id: orgA }]);
  });
});
