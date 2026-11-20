import { Settings } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Podešavanja" };

export default function SettingsPage() {
  return (
    <>
      <PageHeader title="Podešavanja" description="Podaci o firmi i nalogu." />
      <EmptyState
        icon={Settings}
        title="Podešavanja su u pripremi"
        description="Ovde ćete menjati podatke o firmi i nalogu."
      />
    </>
  );
}
