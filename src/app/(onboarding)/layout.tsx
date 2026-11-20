import { LogOut } from "lucide-react";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

/** Signed-in area without an active organization (onboarding, organization picker). */
export default function OnboardingLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-14 w-full max-w-2xl items-center justify-between px-4">
          <Logo href="/" />
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="sm">
              <LogOut aria-hidden="true" />
              Odjava
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
