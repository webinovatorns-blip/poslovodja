import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/jobs",
}));

import { AppShell } from "@/components/layout/app-shell";
import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { MobileBottomNavigation } from "@/components/layout/mobile-bottom-navigation";
import { isNavItemActive } from "@/config/navigation";

describe("DesktopSidebar", () => {
  it("lists every app section and marks the current one", () => {
    render(<DesktopSidebar />);
    const nav = screen.getByRole("complementary", { name: "Glavna navigacija" });

    for (const label of [
      "Pregled",
      "Poslovi",
      "Klijenti",
      "Ponude",
      "Finansije",
      "Ekipa",
      "Podešavanja",
    ]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(within(nav).getByRole("link", { name: "Poslovi" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("renders without an active item when no pathname is given", () => {
    render(<DesktopSidebar activePathname={null} />);
    expect(screen.queryByRole("link", { current: "page" })).not.toBeInTheDocument();
  });
});

describe("MobileBottomNavigation", () => {
  it("shows the primary sections and a 'Više' menu", () => {
    render(<MobileBottomNavigation />);
    const nav = screen.getByRole("navigation", { name: "Mobilna navigacija" });

    for (const label of ["Pregled", "Poslovi", "Klijenti", "Ponude"]) {
      expect(within(nav).getByRole("link", { name: label })).toBeInTheDocument();
    }
    expect(within(nav).getByRole("button", { name: "Više" })).toBeInTheDocument();
    expect(within(nav).getByRole("link", { name: "Poslovi" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("AppShell", () => {
  it("shows the company name, user menu and page content", () => {
    render(
      <AppShell companyName="Test firma" userName="Petar Petrović">
        <p>Sadržaj</p>
      </AppShell>,
    );
    expect(screen.getByTestId("company-name")).toHaveTextContent("Test firma");
    expect(screen.getByRole("button", { name: "Korisnički meni" })).toHaveTextContent(
      "PP",
    );
    expect(screen.getByRole("main")).toHaveTextContent("Sadržaj");
  });
});

describe("isNavItemActive", () => {
  it("matches the route and its sub-routes only", () => {
    expect(isNavItemActive("/jobs", "/jobs")).toBe(true);
    expect(isNavItemActive("/jobs/123", "/jobs")).toBe(true);
    expect(isNavItemActive("/jobsite", "/jobs")).toBe(false);
    expect(isNavItemActive("/clients", "/jobs")).toBe(false);
  });
});
