"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  isNavItemActive,
  mobileOverflowNavigation,
  mobilePrimaryNavigation,
} from "@/config/navigation";
import { cn } from "@/lib/utils";

type MobileBottomNavigationProps = {
  /**
   * Overrides the detected pathname. Used for the Suspense fallback
   * (no active item) and in tests.
   */
  activePathname?: string | null;
};

const itemClassName =
  "flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors";

function BottomNavigationContent({ pathname }: { pathname: string | null }) {
  const isActive = (href: string) => (pathname ? isNavItemActive(pathname, href) : false);
  const overflowActive = mobileOverflowNavigation.some((item) => isActive(item.href));

  return (
    <nav
      aria-label="Mobilna navigacija"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="flex h-16 items-stretch">
        {mobilePrimaryNavigation.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  itemClassName,
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  className={cn("size-5", active && "stroke-[2.5]")}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger
              className={cn(
                itemClassName,
                "cursor-pointer outline-none focus-visible:bg-accent",
                overflowActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <MoreHorizontal className="size-5" aria-hidden="true" />
              <span>Više</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-56">
              {mobileOverflowNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <DropdownMenuItem key={item.href} asChild className="h-11">
                    <Link
                      href={item.href}
                      aria-current={isActive(item.href) ? "page" : undefined}
                    >
                      <Icon aria-hidden="true" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
      </ul>
    </nav>
  );
}

function BottomNavigationWithPathname() {
  const pathname = usePathname();
  return <BottomNavigationContent pathname={pathname} />;
}

/** Thumb-reachable bottom navigation for phones. Hidden from `md` up. */
export function MobileBottomNavigation({ activePathname }: MobileBottomNavigationProps) {
  if (activePathname !== undefined) {
    return <BottomNavigationContent pathname={activePathname} />;
  }
  return <BottomNavigationWithPathname />;
}
