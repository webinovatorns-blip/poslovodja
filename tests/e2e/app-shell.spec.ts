import { expect, test } from "@playwright/test";

import {
  cleanup,
  createConfirmedUser,
  createOrganizationFor,
  hasSupabase,
  signIn,
  SKIP_REASON,
} from "./support/fixtures";

/** Authenticated app shell on desktop and mobile (needs the local Supabase stack). */
test.skip(!hasSupabase(), SKIP_REASON);

const createdUsers: string[] = [];

test.beforeEach(async ({ page }) => {
  const user = await createConfirmedUser("shell", "Petar Petrović");
  createdUsers.push(user.id);
  await createOrganizationFor(user.id, "Moja firma");
  await signIn(page, user.email);
  await expect(page).toHaveURL("/dashboard");
});

test.afterAll(async () => {
  await cleanup(createdUsers);
});

test("app shell shows organization, user name, settings and sign-out", async ({
  page,
}) => {
  await expect(page.getByTestId("company-name")).toHaveText("Moja firma");
  const menu = page.getByRole("button", { name: "Korisnički meni" });
  await expect(menu).toContainText("PP");
  await menu.click();
  await expect(page.getByRole("menuitem", { name: "Podešavanja" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Odjava" })).toBeVisible();
  // Single organization: no switcher.
  await expect(page.getByRole("button", { name: /Promeni organizaciju/ })).toHaveCount(0);
});

test("navigation matches the viewport", async ({ page, isMobile }) => {
  const sidebar = page.getByRole("complementary", { name: "Glavna navigacija" });
  const bottomNav = page.getByRole("navigation", { name: "Mobilna navigacija" });

  if (isMobile) {
    await expect(bottomNav).toBeVisible();
    await expect(sidebar).toBeHidden();

    await bottomNav.getByRole("link", { name: "Poslovi" }).click();
    await expect(page).toHaveURL(/\/jobs$/);
    await expect(bottomNav.getByRole("link", { name: "Poslovi" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await bottomNav.getByRole("button", { name: "Više" }).click();
    await page.getByRole("menuitem", { name: "Finansije" }).click();
    await expect(page).toHaveURL(/\/finances$/);
  } else {
    await expect(sidebar).toBeVisible();
    await expect(bottomNav).toBeHidden();

    await sidebar.getByRole("link", { name: "Ekipa" }).click();
    await expect(page).toHaveURL(/\/team$/);
    await expect(sidebar.getByRole("link", { name: "Ekipa" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
});

test("private pages have no horizontal overflow", async ({ page }) => {
  for (const path of ["/dashboard", "/jobs"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});

test("private pages are not cacheable", async ({ page }) => {
  const response = await page.goto("/dashboard");
  expect(response?.headers()["cache-control"]).toContain("no-store");
});
