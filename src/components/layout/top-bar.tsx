import { Building2 } from "lucide-react";

import { UserMenu } from "@/components/layout/user-menu";

type TopBarProps = {
  companyName: string;
  userName: string;
  userEmail?: string;
};

export function TopBar({ companyName, userName, userEmail }: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-card/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-card/80 md:h-16 md:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Building2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate text-base font-semibold" data-testid="company-name">
          {companyName}
        </span>
      </div>
      <UserMenu userName={userName} userEmail={userEmail} />
    </header>
  );
}
