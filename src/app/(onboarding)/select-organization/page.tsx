import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { OrganizationPicker } from "@/components/onboarding/organization-picker";
import { LoadingState } from "@/components/shared/loading-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { routes } from "@/config/navigation";
import { roleLabels } from "@/config/roles";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { getActiveOrganization } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Izbor organizacije" };

async function Picker({
  searchParams,
}: {
  searchParams: PageProps<"/select-organization">["searchParams"];
}) {
  const resolution = await getActiveOrganization();
  if (resolution.state === "none") {
    redirect(routes.onboarding);
  }

  const { next } = await searchParams;
  return (
    <OrganizationPicker
      next={safeRedirectPath(
        typeof next === "string" ? next : undefined,
        routes.dashboard,
      )}
      organizations={resolution.organizations.map((membership) => ({
        id: membership.organizationId,
        name: membership.organizationName,
        roleLabel: roleLabels[membership.role],
      }))}
    />
  );
}

export default function SelectOrganizationPage(props: PageProps<"/select-organization">) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl">Izaberite organizaciju</h1>
        </CardTitle>
        <CardDescription>
          Član ste više organizacija. Sa kojom želite da radite?
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<LoadingState rows={2} />}>
          <Picker searchParams={props.searchParams} />
        </Suspense>
      </CardContent>
    </Card>
  );
}
