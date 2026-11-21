import { describe, expect, it } from "vitest";

import { addBasePath, normalizeBasePath } from "@/config/base-path";

describe("normalizeBasePath", () => {
  it.each([undefined, "", " ", "/"])("keeps root deployments empty", (value) => {
    expect(normalizeBasePath(value)).toBe("");
  });

  it.each(["poslovodja", "/poslovodja", "/poslovodja/"])(
    "normalizes a subpath",
    (value) => {
      expect(normalizeBasePath(value)).toBe("/poslovodja");
    },
  );

  it("rejects query strings and absolute URLs", () => {
    expect(() => normalizeBasePath("/poslovodja?admin=1")).toThrow();
    expect(() => normalizeBasePath("https://example.com/poslovodja")).toThrow();
  });
});

describe("addBasePath", () => {
  it("prefixes paths and preserves queries", () => {
    expect(addBasePath("/login?next=%2Fdashboard", "/poslovodja")).toBe(
      "/poslovodja/login?next=%2Fdashboard",
    );
  });

  it("does not add the prefix twice", () => {
    expect(addBasePath("/poslovodja/dashboard", "/poslovodja")).toBe(
      "/poslovodja/dashboard",
    );
  });

  it("keeps root deployments unchanged", () => {
    expect(addBasePath("/dashboard", "")).toBe("/dashboard");
  });
});
