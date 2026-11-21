import { describe, expect, it } from "vitest";

import { securityHeaders } from "@/config/security-headers";

const byName = Object.fromEntries(securityHeaders.map(({ key, value }) => [key, value]));

describe("security headers", () => {
  it("sets the baseline headers", () => {
    expect(byName["X-Content-Type-Options"]).toBe("nosniff");
    expect(byName["X-Frame-Options"]).toBe("DENY");
    expect(byName["Content-Security-Policy"]).toBe("frame-ancestors 'none'");
    expect(byName["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byName["Permissions-Policy"]).toContain("camera=()");
  });

  it("HSTS doesn't commit other subdomains of the shared domain", () => {
    expect(byName["Strict-Transport-Security"]).toBe("max-age=31536000");
    expect(byName["Strict-Transport-Security"]).not.toMatch(/includeSubDomains|preload/i);
  });

  it("doesn't set a script CSP that would block Next.js inline scripts or Turnstile", () => {
    expect(byName["Content-Security-Policy"]).not.toMatch(/script-src|default-src/);
  });
});
