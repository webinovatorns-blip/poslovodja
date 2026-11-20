import { describe, expect, it } from "vitest";

// No mock for "server-only" here: outside the React Server environment the
// marker throws, which is what makes a client-bundle import fail the build.
describe("server-only modules", () => {
  it("the admin client cannot be imported outside the server", async () => {
    await expect(import("@/lib/supabase/admin")).rejects.toThrow(
      /Server Component|server-only|cannot be imported/i,
    );
  });

  it("server secrets cannot be imported outside the server", async () => {
    await expect(import("@/lib/env.server")).rejects.toThrow(
      /Server Component|server-only|cannot be imported/i,
    );
  });
});
