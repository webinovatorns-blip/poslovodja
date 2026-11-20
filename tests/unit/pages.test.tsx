import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it, vi } from "vitest";

// Pages render client forms that call server actions and read the URL.
// Server-only modules are replaced; the actions themselves are tested separately.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  redirect: vi.fn(),
}));
vi.mock("@/lib/auth/actions", () => ({
  signInAction: vi.fn(),
  signUpAction: vi.fn(),
  requestPasswordResetAction: vi.fn(),
  updatePasswordAction: vi.fn(),
  signOutAction: vi.fn(),
}));
vi.mock("@/lib/organizations/actions", () => ({
  createOrganizationAction: vi.fn(),
  switchOrganizationAction: vi.fn(),
}));
// The onboarding gate waits on the session; keep it pending so the page shell renders.
vi.mock("@/lib/auth/session", () => ({
  getActiveOrganization: () => new Promise(() => {}),
  getCurrentUser: () => new Promise(() => {}),
}));

import ClientsPage from "@/app/(app)/clients/page";
import DashboardPage from "@/app/(app)/dashboard/page";
import FinancesPage from "@/app/(app)/finances/page";
import JobsPage from "@/app/(app)/jobs/page";
import QuotesPage from "@/app/(app)/quotes/page";
import SettingsPage from "@/app/(app)/settings/page";
import TeamPage from "@/app/(app)/team/page";
import ForgotPasswordPage from "@/app/(auth)/forgot-password/page";
import LoginPage from "@/app/(auth)/login/page";
import RegisterPage from "@/app/(auth)/register/page";
import OnboardingPage from "@/app/(onboarding)/onboarding/page";
import MarketingPage from "@/app/(marketing)/page";

const pages: Array<[name: string, Page: ComponentType, heading: string]> = [
  ["marketing", MarketingPage, "Vaš posao, pod kontrolom."],
  ["login", LoginPage, "Prijava"],
  ["register", RegisterPage, "Registracija"],
  ["forgot-password", ForgotPasswordPage, "Zaboravljena lozinka"],
  ["onboarding", OnboardingPage, "Dobro došli!"],
  ["dashboard", DashboardPage, "Pregled"],
  ["clients", ClientsPage, "Klijenti"],
  ["jobs", JobsPage, "Poslovi"],
  ["quotes", QuotesPage, "Ponude"],
  ["finances", FinancesPage, "Finansije"],
  ["team", TeamPage, "Ekipa"],
  ["settings", SettingsPage, "Podešavanja"],
];

describe("pages", () => {
  it.each(pages)("%s page renders its main heading", (_name, Page, heading) => {
    render(<Page />);
    expect(screen.getByRole("heading", { level: 1, name: heading })).toBeInTheDocument();
  });
});
