import {
  Briefcase,
  FileText,
  HardHat,
  LayoutDashboard,
  Settings,
  Users,
  Wallet,
} from "lucide-react";

import type { NavItem } from "@/types/navigation";

export const routes = {
  home: "/",
  login: "/login",
  register: "/register",
  onboarding: "/onboarding",
  dashboard: "/dashboard",
  clients: "/clients",
  jobs: "/jobs",
  quotes: "/quotes",
  finances: "/finances",
  team: "/team",
  settings: "/settings",
} as const;

const dashboard: NavItem = {
  label: "Pregled",
  href: routes.dashboard,
  icon: LayoutDashboard,
};
const jobs: NavItem = { label: "Poslovi", href: routes.jobs, icon: Briefcase };
const clients: NavItem = { label: "Klijenti", href: routes.clients, icon: Users };
const quotes: NavItem = { label: "Ponude", href: routes.quotes, icon: FileText };
const finances: NavItem = { label: "Finansije", href: routes.finances, icon: Wallet };
const team: NavItem = { label: "Ekipa", href: routes.team, icon: HardHat };
const settings: NavItem = { label: "Podešavanja", href: routes.settings, icon: Settings };

/** Full navigation, shown in the desktop sidebar. */
export const appNavigation: NavItem[] = [
  dashboard,
  jobs,
  clients,
  quotes,
  finances,
  team,
  settings,
];

/** Most-used sections, shown directly in the mobile bottom bar (max 4 + "Više"). */
export const mobilePrimaryNavigation: NavItem[] = [dashboard, jobs, clients, quotes];

/** Remaining sections, reachable via the "Više" menu on mobile. */
export const mobileOverflowNavigation: NavItem[] = [finances, team, settings];

/** True when `pathname` is the nav item's route or one of its sub-routes. */
export function isNavItemActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
