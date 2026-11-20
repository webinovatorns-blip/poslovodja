import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { LoadingState } from "@/components/shared/loading-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { routes } from "@/config/navigation";
import { getActiveOrganization } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Podešavanje firme" };

/** Server guard: signed-in users only; users who already have an organization skip onboarding. */
async function OnboardingGate() {
  const resolution = await getActiveOrganization();
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
