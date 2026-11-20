import { expect, test } from "@playwright/test";

const publicPages = [
  { path: "/", heading: "Vaš posao, pod kontrolom." },
  { path: "/login", heading: "Prijava" },
  { path: "/register", heading: "Registracija" },
  { path: "/onboarding", heading: "Dobro došli!" },
];

const appPages = [
  { path: "/dashboard", heading: "Pregled" },
  { path: "/clients", heading: "Klijenti" },
  { path: "/jobs", heading: "Poslovi" },
  { path: "/quotes", heading: "Ponude" },
  { path: "/finances", heading: "Finansije" },
  { path: "/team", heading: "Ekipa" },
  { path: "/settings", heading: "Podešavanja" },
];

for (const { path, heading } of [...publicPages, ...appPages]) {
  test(`${path} renders`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "sr-Latn");
  });
}

test("unknown route shows the 404 page", async ({ page }) => {
  const response = await page.goto("/ne-postoji");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "Stranica nije pronađena" }),
  ).toBeVisible();
});

test("app shell shows company name and user menu", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByTestId("company-name")).toHaveText("Moja firma");
  await page.getByRole("button", { name: "Korisnički meni" }).click();
  await expect(page.getByRole("menuitem", { name: "Odjava" })).toBeVisible();
});

test("navigation matches the viewport", async ({ page, isMobile }) => {
  await page.goto("/dashboard");
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

test("page has no horizontal overflow", async ({ page }) => {
  for (const path of ["/", "/dashboard", "/jobs"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
