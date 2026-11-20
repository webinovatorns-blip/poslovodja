import { HardHat } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Ekipa" };

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Ekipa" description="Članovi vaše ekipe." />
      <EmptyState
        icon={HardHat}
        title="Još nemate članove ekipe"
        description="Ovde ćete dodavati i organizovati članove ekipe."
      />
    </>
  );
}
