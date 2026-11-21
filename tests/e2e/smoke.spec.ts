import { expect, test } from "@playwright/test";

import { formAlert } from "./support/fixtures";

/** Public pages and server-side route protection. No Supabase needed. */

const publicPages = [
  { path: "/", heading: "Vaš posao, pod kontrolom." },
  { path: "/login", heading: "Prijava" },
  { path: "/register", heading: "Registracija" },
  { path: "/forgot-password", heading: "Zaboravljena lozinka" },
  { path: "/reset-password", heading: "Nova lozinka" },
];

const protectedPages = [
  "/onboarding",
  "/select-organization",
  "/dashboard",
  "/clients",
  "/jobs",
  "/quotes",
  "/finances",
  "/team",
  "/settings",
];

for (const { path, heading } of publicPages) {
  test(`${path} renders`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "sr-Latn");
  });
}

for (const path of protectedPages) {
  test(`[7] ${path} redirects a signed-out visitor to /login`, async ({
    page,
    request,
  }) => {
    // Real HTTP redirect from the proxy, before anything renders.
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(307);
    expect(response.headers()["location"]).toBe(
      `/login?next=${encodeURIComponent(path)}`,
    );
    expect(response.headers()["cache-control"]).toContain("no-store");

    await page.goto(path);
    await expect(page).toHaveURL(`/login?next=${encodeURIComponent(path)}`);
    await expect(page.getByRole("heading", { level: 1, name: "Prijava" })).toBeVisible();
  });
}

test("reset-password without a recovery session explains the link is invalid", async ({
  page,
}) => {
  await page.goto("/reset-password");
  await expect(
    page.getByText("Link za promenu lozinke nije važeći ili je istekao"),
  ).toBeVisible();
});

test("[12] an external next URL on /login is never followed", async ({ request }) => {
  const response = await request.get("/dashboard?x=1", { maxRedirects: 0 });
  expect(response.headers()["location"]).toBe("/login?next=%2Fdashboard%3Fx%3D1");
});

test("an invalid auth callback link shows a friendly error", async ({ page }) => {
  await page.goto(
    "/auth/callback?code=PLACEHOLDER-INVALID&next=https%3A%2F%2Fevil.example",
  );
  await expect(page).toHaveURL("/login?error=link_invalid");
  await expect(formAlert(page)).toHaveText(
    "Link nije važeći ili je istekao. Zatražite novi.",
  );
});

test("pages send security headers", async ({ request }) => {
  for (const path of ["/", "/login"]) {
    const headers = (await request.get(path)).headers();
    expect(headers["x-content-type-options"], path).toBe("nosniff");
    expect(headers["x-frame-options"], path).toBe("DENY");
    expect(headers["content-security-policy"], path).toBe("frame-ancestors 'none'");
    expect(headers["referrer-policy"], path).toBe("strict-origin-when-cross-origin");
    expect(headers["strict-transport-security"], path).toBe("max-age=31536000");
  }
});

test("unknown route shows the 404 page", async ({ page }) => {
  const response = await page.goto("/ne-postoji");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Stranica nije pronađena" }),
  ).toBeVisible();
});

test("public pages have no horizontal overflow", async ({ page }) => {
  for (const path of ["/", "/login", "/register"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("login form fields have labels and autocomplete hints", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("E-mail")).toHaveAttribute("autocomplete", "email");
  await expect(page.getByLabel("Lozinka", { exact: true })).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  // Keyboard navigation reaches the submit button.
  await page.getByLabel("E-mail").focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Prijavi se" })).toBeFocused();
});
