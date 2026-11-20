import type { LucideIcon } from "lucide-react";

export type NavItem = {
  /** User-facing label (Serbian, Latin script). */
  label: string;
  href: string;
  icon: LucideIcon;
};
