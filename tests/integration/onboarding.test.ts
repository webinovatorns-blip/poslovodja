/**
 * Onboarding RPC over the real Data API: concurrency and ownership.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { adminClient, createSignedInUser, rawRest, type TestUser } from "./helpers";

let user: TestUser;
let other: TestUser;

const details = {
  p_name: "Paralelna Firma",
  p_business_type: "electrical",
  p_phone: "064 111 2222",
  p_email: "kontakt@paralelna.test",
};

beforeAll(async () => {
  [user, other] = await Promise.all([
    createSignedInUser("onboarding"),
    createSignedInUser("onboarding-other"),
  ]);
});

afterAll(async () => {
  const admin = adminClient();
  const { data } = await admin
    .from("memberships")
    .select("organization_id")
    .in("user_id", [user.id, other.id]);
  const ids = [...new Set((data ?? []).map((row) => row.organization_id))];
  if (ids.length) await admin.from("organizations").delete().in("id", ids);
  for (const u of [user, other]) await admin.auth.admin.deleteUser(u.id);
});

describe("create_organization_with_details", () => {
  it("[16] concurrent submits with the same key create exactly one organization", async () => {
    const key = crypto.randomUUID();
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        user.client.rpc("create_organization_with_details", {
          p_idempotency_key: key,
          ...details,
        }),
      ),
    );

    for (const result of results) expect(result.error).toBeNull();
    expect(new Set(results.map((result) => result.data)).size).toBe(1);

    const { data: memberships } = await user.client
      .from("memberships")
      .select("organization_id, role")
      .eq("user_id", user.id);
    expect(memberships).toEqual([{ organization_id: results[0].data, role: "owner" }]);
  });

  it("[15] direct inserts stay impossible for the onboarding user", async () => {
    const response = await rawRest("organizations", {
      method: "POST",
      accessToken: user.accessToken,
      body: JSON.stringify({ name: "Direktno", slug: "direktno-onboarding" }),
    });
    expect(response.status).toBe(403);
  });

  it("the private idempotency table is not reachable through the API", async () => {
    const response = await rawRest("organization_creation_requests?select=*", {
      accessToken: user.accessToken,
    });
    expect(response.status).toBe(404);
  });

  it("another user can't reuse someone else's key to join their organization", async () => {
    const key = crypto.randomUUID();
    const first = await user.client.rpc("create_organization_with_details", {
      p_idempotency_key: key,
      ...details,
      p_name: "Prva",
    });
    const second = await other.client.rpc("create_organization_with_details", {
      p_idempotency_key: key,
      ...details,
      p_name: "Druga",
    });
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data).not.toBe(first.data);

    const { data: visible } = await other.client.from("organizations").select("id");
    expect(visible?.map((row) => row.id)).toEqual([second.data]);
  });

  it("validation errors are stable keys (no internals)", async () => {
    const { error } = await user.client.rpc("create_organization_with_details", {
      p_idempotency_key: crypto.randomUUID(),
      ...details,
      p_business_type: "nuclear",
    });
    expect(error?.message).toBe("invalid_business_type");
  });
});
