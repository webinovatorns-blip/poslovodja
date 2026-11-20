import { Suspense, type ReactNode } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { LoadingState } from "@/components/shared/loading-state";
import { MembershipsUnavailableState } from "@/components/shared/memberships-unavailable-state";
import {
  isMembershipsUnavailableError,
  requireOrganization,
  type OrganizationContext,
} from "@/lib/auth/session";

/**
 * Authoritative server guard for the app area: requireOrganization()
 * verifies the user with Supabase Auth and the active organization against
 * the user's ACTIVE memberships on every request. Nothing below renders
 * without it. (The proxy only adds fast HTTP redirects for signed-out users.)
 * If memberships can't be read, a retryable error is shown instead (never
 * onboarding). This layout's error is not caught by (app)/error.tsx, so it's
 * handled here.
 */
async function GuardedShell({ children }: { children: ReactNode }) {
  let context: OrganizationContext;
  try {
    context = await requireOrganization();
  } catch (error) {
    if (isMembershipsUnavailableError(error)) {
      return (
        <main className="mx-auto w-full max-w-2xl px-4 py-8">
          <MembershipsUnavailableState />
        </main>
      );
    }
    throw error; // redirects and unexpected errors
  }
  const { user, organization, organizations } = context;

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
