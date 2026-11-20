import { Suspense, type ReactNode } from "react";

import { DesktopSidebar } from "@/components/layout/desktop-sidebar";
import { MobileBottomNavigation } from "@/components/layout/mobile-bottom-navigation";
import { TopBar } from "@/components/layout/top-bar";

type AppShellProps = {
  companyName: string;
  userName: string;
  userEmail?: string;
  children: ReactNode;
};

/**
 * Authenticated app frame: desktop sidebar, top bar, mobile bottom nav.
 *
 * Navigation reads the URL via `usePathname`. The Suspense boundaries keep
 * the shell prerenderable once routes with dynamic params (e.g.
 * `/jobs/[id]`) are added; the fallback renders nav without an active item.
 */
export function AppShell({ companyName, userName, userEmail, children }: AppShellProps) {
  return (
    <div className="min-h-dvh">
      <Suspense fallback={<DesktopSidebar activePathname={null} />}>
        <DesktopSidebar />
      </Suspense>

      <div className="flex min-h-dvh flex-col md:pl-60">
        <TopBar companyName={companyName} userName={userName} userEmail={userEmail} />
        <main
          id="main-content"
          className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-40 md:px-8 md:pt-8 md:pb-12"
        >
          {children}
        </main>
      </div>

      <Suspense fallback={<MobileBottomNavigation activePathname={null} />}>
        <MobileBottomNavigation />
      </Suspense>
    </div>
  );
}
