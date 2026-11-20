import {
  OrganizationSwitcher,
  type OrganizationOption,
} from "@/components/layout/organization-switcher";
import { UserMenu } from "@/components/layout/user-menu";

type TopBarProps = {
  companyName: string;
  activeOrganizationId?: string;
  organizations?: OrganizationOption[];
  userName: string;
  userEmail?: string;
};

export function TopBar({
  companyName,
  activeOrganizationId = "",
  organizations = [],
  userName,
  userEmail,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b bg-card/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-card/80 md:h-16 md:px-6">
      <OrganizationSwitcher
        activeOrganizationId={activeOrganizationId}
        activeOrganizationName={companyName}
        organizations={organizations}
      />
      <UserMenu userName={userName} userEmail={userEmail} />
    </header>
  );
}
