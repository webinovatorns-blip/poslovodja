import { LayoutDashboard } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Pregled" };

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Pregled"
        description="Najvažnije informacije o vašem poslovanju."
      />
      <EmptyState
        icon={LayoutDashboard}
        title="Još nema podataka"
        description="Ovde će se prikazivati aktivni poslovi, uplate i zarada."
      />
    </>
  );
}
