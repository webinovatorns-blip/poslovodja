"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/layout/logo";
import { appNavigation, isNavItemActive, routes } from "@/config/navigation";
import { cn } from "@/lib/utils";

type DesktopSidebarProps = {
  /**
   * Overrides the detected pathname. Used for the Suspense fallback
   * (no active item) and in tests.
   */
  activePathname?: string | null;
};

function SidebarContent({ pathname }: { pathname: string | null }) {
  return (
    <aside
      aria-label="Glavna navigacija"
      className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r bg-sidebar text-sidebar-foreground md:flex"
    >
      <div className="flex h-16 items-center border-b px-5">
        <Logo href={routes.dashboard} />
      </div>
      <nav className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {appNavigation.map((item) => {
            const active = pathname ? isNavItemActive(pathname, item.href) : false;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-active text-sidebar-active-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <Icon className="size-4.5" aria-hidden="true" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

function SidebarWithPathname() {
  const pathname = usePathname();
  return <SidebarContent pathname={pathname} />;
}

/** Left navigation for `md` screens and up. Hidden on phones. */
export function DesktopSidebar({ activePathname }: DesktopSidebarProps) {
  if (activePathname !== undefined) {
    return <SidebarContent pathname={activePathname} />;
  }
  return <SidebarWithPathname />;
}
