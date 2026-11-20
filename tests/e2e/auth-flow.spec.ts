import { expect, test } from "@playwright/test";

import {
  cleanup,
  createConfirmedUser,
  createOrganizationFor,
  emailLink,
  formAlert,
  hasSupabase,
  PASSWORD,
  signIn,
  signOut,
  SKIP_REASON,
  uniqueEmail,
  userIdByEmail,
} from "./support/fixtures";

/**
 * Real end-to-end flows against the local Supabase stack: Auth sends emails
 * to Mailpit, the app talks to PostgREST with the publishable key, RLS applies.
 */
test.skip(!hasSupabase(), SKIP_REASON);

const createdUsers: string[] = [];

test.afterAll(async () => {
  await cleanup(createdUsers);
});

test("register → confirm email → onboarding → dashboard → sign out → sign in again", async ({
  page,
}) => {
  const email = uniqueEmail("novi");

  // 1. Registration
  await page.goto("/register");
  await page.getByLabel("Ime i prezime").fill("Marko Marković");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Potvrda lozinke").fill(PASSWORD);
  await page.getByLabel(/Prihvatam uslove/).check();
  await page.getByRole("button", { name: "Napravi nalog" }).click();
  await expect(page.getByText("Proverite e-mail.", { exact: false })).toBeVisible();

  const userId = await userIdByEmail(email);
  expect(userId).toBeTruthy();
  createdUsers.push(userId!);

  // Not confirmed yet: sign-in is refused with a clear message.
  await signIn(page, email);
  await expect(formAlert(page)).toContainText("E-mail adresa još nije potvrđena");

  // 2. Email confirmation link (Mailpit) → /auth/callback → onboarding
  await page.goto(await emailLink(email, /confirm/i));
  await expect(page).toHaveURL("/onboarding");
  await expect(
    page.getByRole("heading", { level: 1, name: "Dobro došli!" }),
  ).toBeVisible();

  // Without an organization, private pages lead back to onboarding.
  await page.goto("/jobs");
  await expect(page).toHaveURL("/onboarding");

  // 3. Onboarding: validation, then success
  await page.getByRole("button", { name: "Sačuvaj i nastavi" }).click();
  await expect(page.getByText("Ovo polje je obavezno.").first()).toBeVisible();

  await page.getByLabel("Naziv firme ili radnje").fill("Klima Servis Marković");
  await page.getByLabel("Vrsta delatnosti").selectOption("hvac_service");
  await expect(page.getByLabel("Država")).toHaveValue("RS");
  await expect(page.getByLabel("Valuta")).toHaveValue("RSD");
  await page.getByLabel("Telefon").fill("064 123 4567");
  await page.getByLabel("E-mail firme").fill("info@klima-markovic.test");
  await page.getByLabel("Grad").fill("Novi Sad");
  // Double click: still exactly one organization.
  await page.getByRole("button", { name: "Sačuvaj i nastavi" }).dblclick();

  // 4. Dashboard with the new organization in the header
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Pregled" })).toBeVisible();
  await expect(page.getByTestId("company-name")).toHaveText("Klima Servis Marković");
  await expect(page.getByRole("button", { name: "Korisnički meni" })).toContainText("MM");

  // Onboarding is done: it now redirects to the dashboard.
  await page.goto("/onboarding");
  await expect(page).toHaveURL("/dashboard");
  // Signed-in users skip /login and /register.
  await page.goto("/login");
  await expect(page).toHaveURL("/dashboard");

  // 5. Sign out: private pages are no longer reachable, even via Back.
  await signOut(page);
  await expect(page.getByText("Odjavili ste se.")).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/login?next=%2Fdashboard");

  // 6. Sign in again → back to the requested page.
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Prijavi se" }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByTestId("company-name")).toHaveText("Klima Servis Marković");
});

test("wrong password shows a generic message", async ({ page }) => {
  const user = await createConfirmedUser("pogresna", "Pera Perić");
  createdUsers.push(user.id);
  await signIn(page, user.email, "sasvim-pogresna-lozinka");
  await expect(formAlert(page)).toHaveText("Pogrešan e-mail ili lozinka.");
});

test("forgot password → email link → new password → signed in", async ({ page }) => {
  const user = await createConfirmedUser("reset", "Ana Anić");
  createdUsers.push(user.id);
  await createOrganizationFor(user.id, "Ana Keramika");

  // Neutral message, for known and unknown addresses alike.
  for (const address of [uniqueEmail("nepostoji"), user.email]) {
    await page.goto("/forgot-password");
    await page.getByLabel("E-mail").fill(address);
    await page.getByRole("button", { name: "Pošalji uputstvo" }).click();
    await expect(
      page.getByText(
        "Ako postoji nalog sa ovom adresom, poslali smo uputstvo za promenu lozinke.",
      ),
    ).toBeVisible();
  }

  await page.goto(await emailLink(user.email, /reset/i));
  await expect(page).toHaveURL("/reset-password");
  await page.getByLabel("Nova lozinka", { exact: true }).fill("kratka");
  await page.getByLabel("Potvrda nove lozinke").fill("kratka");
  await page.getByRole("button", { name: "Sačuvaj novu lozinku" }).click();
  await expect(page.getByText("Lozinka mora imati najmanje 10 karaktera.")).toBeVisible();

  const newPassword = "nova-e2e-lozinka-456";
  await page.getByLabel("Nova lozinka", { exact: true }).fill(newPassword);
  await page.getByLabel("Potvrda nove lozinke").fill(newPassword);
  await page.getByRole("button", { name: "Sačuvaj novu lozinku" }).click();
  await expect(page).toHaveURL("/dashboard");

  await signOut(page);
  await signIn(page, user.email, newPassword);
  await expect(page).toHaveURL("/dashboard");
});

test("several organizations: pick, switch, and forged choices are ignored", async ({
  page,
  context,
}) => {
  const user = await createConfirmedUser("vise", "Mila Milić");
  createdUsers.push(user.id);
  const alpha = await createOrganizationFor(user.id, "Alfa Elektro", { createdUsers });
  const beta = await createOrganizationFor(user.id, "Beta Vodoinstalacije", {
    role: "worker",
    createdUsers,
  });
  const suspended = await createOrganizationFor(user.id, "Gama Suspendovana", {
    role: "worker",
    status: "suspended",
    createdUsers,
  });
  const stranger = await createConfirmedUser("tudji", "Tuđi Vlasnik");
  createdUsers.push(stranger.id);
  const foreign = await createOrganizationFor(stranger.id, "Tuđa Firma");

  // Sign-in with several organizations → picker (suspended one isn't offered).
  await signIn(page, user.email);
  await expect(page).toHaveURL(/\/select-organization/);
  await expect(page.getByRole("button", { name: /Alfa Elektro/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Beta Vodoinstalacije/ })).toBeVisible();
  await expect(page.getByText("Gama Suspendovana")).toHaveCount(0);
  await expect(page.getByText("Tuđa Firma")).toHaveCount(0);

  await page.getByRole("button", { name: /Alfa Elektro/ }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByTestId("company-name")).toHaveText("Alfa Elektro");

  // Switch through the header.
  await page.getByRole("button", { name: /Promeni organizaciju/ }).click();
  await page.getByRole("menuitem", { name: "Beta Vodoinstalacije" }).click();
  await expect(page.getByTestId("company-name")).toHaveText("Beta Vodoinstalacije");

  // [10] Forge the preference cookie with a foreign organization: ignored.
  for (const forged of [foreign, suspended]) {
    await context.addCookies([
      { name: "poslovodja_active_org", value: forged, url: "http://localhost:3100" },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/select-organization/);
    await expect(page.getByText("Tuđa Firma")).toHaveCount(0);
    await expect(page.getByText("Gama Suspendovana")).toHaveCount(0);
  }

  // A valid preference is honored again.
  await context.addCookies([
    { name: "poslovodja_active_org", value: alpha, url: "http://localhost:3100" },
  ]);
  await page.goto("/dashboard");
  await expect(page.getByTestId("company-name")).toHaveText("Alfa Elektro");
  expect(beta).not.toBe(alpha);
});

test("[11] a user whose only membership is suspended has no access", async ({ page }) => {
  const user = await createConfirmedUser("suspendovan", "Sava Savić");
  createdUsers.push(user.id);
  await createOrganizationFor(user.id, "Firma Koja Suspenduje", {
    role: "worker",
    status: "suspended",
    createdUsers,
  });

  await signIn(page, user.email);
  await expect(page).toHaveURL("/onboarding");
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/onboarding");
});
