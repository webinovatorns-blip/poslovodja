import { render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";

import ClientsPage from "@/app/(app)/clients/page";
import DashboardPage from "@/app/(app)/dashboard/page";
import FinancesPage from "@/app/(app)/finances/page";
import JobsPage from "@/app/(app)/jobs/page";
import QuotesPage from "@/app/(app)/quotes/page";
import SettingsPage from "@/app/(app)/settings/page";
import TeamPage from "@/app/(app)/team/page";
import LoginPage from "@/app/(auth)/login/page";
import OnboardingPage from "@/app/(auth)/onboarding/page";
import RegisterPage from "@/app/(auth)/register/page";
import MarketingPage from "@/app/(marketing)/page";

const pages: Array<[name: string, Page: ComponentType, heading: string]> = [
  ["marketing", MarketingPage, "Vaš posao, pod kontrolom."],
  ["login", LoginPage, "Prijava"],
  ["register", RegisterPage, "Registracija"],
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
