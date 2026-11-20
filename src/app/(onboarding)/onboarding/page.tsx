import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { LoadingState } from "@/components/shared/loading-state";
import { MembershipsUnavailableState } from "@/components/shared/memberships-unavailable-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { routes } from "@/config/navigation";
import {
  getActiveOrganization,
  isMembershipsUnavailableError,
  type ActiveOrganizationContext,
} from "@/lib/auth/session";

export const metadata: Metadata = { title: "Podešavanje firme" };

/**
 * Server guard: signed-in users only; users who already have an organization
 * skip onboarding. If memberships can't be read, the form is NOT shown (it
 * could lead to a duplicate organization); a retryable error is shown instead.
 */
async function OnboardingGate() {
  let resolution: ActiveOrganizationContext;
  try {
    resolution = await getActiveOrganization();
  } catch (error) {
    if (isMembershipsUnavailableError(error)) {
      return <MembershipsUnavailableState />;
    }
    throw error;
  }
  if (resolution.state !== "none") {
    redirect(routes.dashboard);
  }
  return <OnboardingForm />;
}

export default function OnboardingPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl">Dobro došli!</h1>
        </CardTitle>
        <CardDescription>
          Unesite osnovne podatke o firmi. Sve možete kasnije promeniti u podešavanjima.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense fallback={<LoadingState rows={4} />}>
          <OnboardingGate />
        </Suspense>
      </CardContent>
    </Card>
  );
}
