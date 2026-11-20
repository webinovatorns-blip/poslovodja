import type { Metadata } from "next";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Podešavanje firme" };

const steps = ["Podaci o firmi", "Vrsta usluga", "Članovi ekipe"];

export default function OnboardingPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 className="text-2xl">Dobro došli!</h1>
        </CardTitle>
        <CardDescription>Podesite svoju firmu u nekoliko koraka.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {steps.map((step, index) => (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span className="flex size-7 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-primary">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
