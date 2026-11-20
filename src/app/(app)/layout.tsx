import { Suspense, type ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { LoadingState } from "@/components/shared/loading-state";
import { requireOrganization } from "@/lib/auth/session";

/**
 * Authoritative server guard for the app area: requireOrganization()
 * verifies the user with Supabase Auth and the active organization against
 * the user's ACTIVE memberships on every request. Nothing below renders
 * without it. (The proxy only adds fast HTTP redirects for signed-out users.)
 */
async function GuardedShell({ children }: { children: ReactNode }) {
  const { user, organization, organizations } = await requireOrganization();

  return (
    <AppShell
      companyName={organization.organizationName}
      activeOrganizationId={organization.organizationId}
      organizations={organizations.map((membership) => ({
        id: membership.organizationId,
        name: membership.organizationName,
      }))}
      userName={user.fullName || user.email}
      userEmail={user.email}
    >
      {children}
    </AppShell>
  );
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl p-6">
          <LoadingState />
        </div>
      }
    >
      <GuardedShell>{children}</GuardedShell>
    </Suspense>
  );
}
