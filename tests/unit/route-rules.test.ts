import { describe, expect, it } from "vitest";

import { safeRedirectPath } from "@/lib/auth/redirects";
import { decidePostAuthDestination, decideProxyRoute } from "@/lib/auth/route-rules";

describe("safeRedirectPath", () => {
  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "\\\\evil.example",
    "javascript:alert(1)",
    "evil.example",
    "/%0d%0aSet-Cookie:x",
    "/\u0000",
    "/\tevil",
    "http:/evil.example",
    "/auth/callback?next=/dashboard",
    "",
  ])("[12] rejects %j", (value) => {
    expect(safeRedirectPath(value, "/dashboard")).toBe(
      value === "/%0d%0aSet-Cookie:x" ? "/%0d%0aSet-Cookie:x" : "/dashboard",
    );
  });

  it("[12] keeps encoded CR/LF encoded (never decoded into a header)", () => {
    expect(safeRedirectPath("/%0d%0aSet-Cookie:x")).toBe("/%0d%0aSet-Cookie:x");
  });

  it.each([
    ["/dashboard", "/dashboard"],
    ["/jobs?status=open", "/jobs?status=open"],
    ["/clients#top", "/clients#top"],
    ["/settings/../team", "/team"],
  ])("[13] accepts the internal path %j", (value, expected) => {
    expect(safeRedirectPath(value)).toBe(expected);
  });

  it("falls back for non-string input", () => {
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
    expect(safeRedirectPath(["/jobs"], "/x")).toBe("/x");
  });
});

describe("decideProxyRoute", () => {
  it("[7] redirects a signed-out user from a private page to /login with the path kept", () => {
    expect(
      decideProxyRoute({
        pathname: "/jobs",
        search: "?status=open",
        isAuthenticated: false,
      }),
    ).toEqual({ type: "redirect", location: "/login?next=%2Fjobs%3Fstatus%3Dopen" });
  });

  it.each([
    "/onboarding",
    "/dashboard",
    "/clients",
    "/quotes",
    "/finances",
    "/team",
    "/settings",
    "/select-organization",
  ])("[7] protects %s", (pathname) => {
    expect(decideProxyRoute({ pathname, search: "", isAuthenticated: false }).type).toBe(
      "redirect",
    );
  });

  it("lets everyone see public pages", () => {
    for (const pathname of [
      "/",
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/auth/callback",
    ]) {
      expect(decideProxyRoute({ pathname, search: "", isAuthenticated: false })).toEqual({
        type: "next",
      });
    }
  });

  it("sends signed-in users away from /login and /register via /auth/continue", () => {
    expect(
      decideProxyRoute({ pathname: "/login", search: "", isAuthenticated: true }),
    ).toEqual({
      type: "redirect",
      location: "/auth/continue",
    });
    expect(
      decideProxyRoute({
        pathname: "/register",
        search: "?next=https%3A%2F%2Fevil.example",
        isAuthenticated: true,
      }),
    ).toEqual({ type: "redirect", location: "/auth/continue?next=%2Fdashboard" });
  });

  it("does not redirect a signed-in user on /reset-password (recovery session)", () => {
    expect(
      decideProxyRoute({
        pathname: "/reset-password",
        search: "",
        isAuthenticated: true,
      }),
    ).toEqual({ type: "next" });
  });

  it("does not treat look-alike paths as protected", () => {
    expect(
      decideProxyRoute({
        pathname: "/dashboards-info",
        search: "",
        isAuthenticated: false,
      }),
    ).toEqual({ type: "next" });
  });
});

describe("decidePostAuthDestination", () => {
  it("[8] a user without an organization goes to onboarding (even with next)", () => {
    expect(decidePostAuthDestination("none")).toBe("/onboarding");
    expect(decidePostAuthDestination("none", "/jobs")).toBe("/onboarding");
  });

  it("[9] a user with an organization goes to the dashboard", () => {
    expect(decidePostAuthDestination("selected")).toBe("/dashboard");
    expect(decidePostAuthDestination("selected", "/onboarding")).toBe("/dashboard");
    expect(decidePostAuthDestination("selected", "/login")).toBe("/dashboard");
  });

  it("[9] honors a safe internal next path", () => {
    expect(decidePostAuthDestination("selected", "/jobs?x=1")).toBe("/jobs?x=1");
  });

  it("[12] ignores an external next path", () => {
    expect(decidePostAuthDestination("selected", "https://evil.example")).toBe(
      "/dashboard",
    );
  });

  it("users with several organizations and no valid choice pick one first", () => {
    expect(decidePostAuthDestination("needs-selection", "/team")).toBe(
      "/select-organization?next=%2Fteam",
    );
    expect(decidePostAuthDestination("needs-selection", "/onboarding")).toBe(
      "/select-organization?next=%2Fdashboard",
    );
  });
});
