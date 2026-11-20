import { describe, expect, it } from "vitest";

import {
  hasRole,
  hasRoleAtLeast,
  resolveActiveOrganization,
  type OrganizationMembership,
} from "@/lib/auth/active-organization";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FOREIGN_ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const membershipA: OrganizationMembership = {
  organizationId: ORG_A,
  organizationName: "Alfa Klima",
  role: "owner",
  status: "active",
};
const membershipB: OrganizationMembership = {
  organizationId: ORG_B,
  organizationName: "Beta Elektro",
  role: "worker",
  status: "active",
};

describe("resolveActiveOrganization", () => {
  it("no memberships → onboarding state", () => {
    expect(resolveActiveOrganization([], ORG_A).state).toBe("none");
  });

  it("a single organization is selected automatically", () => {
    const result = resolveActiveOrganization([membershipA], null);
    expect(result.state === "selected" && result.organization.organizationId).toBe(ORG_A);
  });

  it("[10] a preferred organization the user doesn't belong to is ignored", () => {
    const single = resolveActiveOrganization([membershipA], FOREIGN_ORG);
    expect(single.state === "selected" && single.organization.organizationId).toBe(ORG_A);

    const multiple = resolveActiveOrganization([membershipA, membershipB], FOREIGN_ORG);
    expect(multiple.state).toBe("needs-selection");
  });

  it("[10] malformed preferred ids are ignored", () => {
    const result = resolveActiveOrganization([membershipA, membershipB], "' or 1=1 --");
    expect(result.state).toBe("needs-selection");
  });

  it("[11] suspended memberships never grant access", () => {
    const suspended = { ...membershipB, status: "suspended" as const };
    expect(resolveActiveOrganization([suspended], ORG_B).state).toBe("none");

    const result = resolveActiveOrganization([membershipA, suspended], ORG_B);
    expect(result.state === "selected" && result.organization.organizationId).toBe(ORG_A);
    expect(result.organizations.map((item) => item.organizationId)).toEqual([ORG_A]);
  });

  it("[11] invited (not yet active) memberships never grant access", () => {
    expect(
      resolveActiveOrganization([{ ...membershipA, status: "invited" }], ORG_A).state,
    ).toBe("none");
  });

  it("[19] with several organizations the valid preferred one is selected", () => {
    const toA = resolveActiveOrganization([membershipA, membershipB], ORG_A);
    const toB = resolveActiveOrganization(
      [membershipA, membershipB],
      ORG_B.toUpperCase(),
    );
    expect(toA.state === "selected" && toA.organization.organizationId).toBe(ORG_A);
    expect(toB.state === "selected" && toB.organization.role).toBe("worker");
  });

  it("[19] several organizations without a choice require selection", () => {
    const result = resolveActiveOrganization([membershipB, membershipA], null);
    expect(result.state).toBe("needs-selection");
    expect(result.organizations.map((item) => item.organizationName)).toEqual([
      "Alfa Klima",
      "Beta Elektro",
    ]);
  });
});

describe("roles", () => {
  it("checks explicit role lists and minimum roles", () => {
    expect(hasRole("admin", ["owner", "admin"])).toBe(true);
    expect(hasRole("worker", ["owner", "admin"])).toBe(false);
    expect(hasRoleAtLeast("manager", "worker")).toBe(true);
    expect(hasRoleAtLeast("worker", "manager")).toBe(false);
  });
});
