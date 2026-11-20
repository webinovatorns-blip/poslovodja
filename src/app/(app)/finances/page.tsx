import { Wallet } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = { title: "Finansije" };

export default function FinancesPage() {
  return (
    <>
      <PageHeader title="Finansije" description="Troškovi, uplate i zarada po poslu." />
      <EmptyState
        icon={Wallet}
        title="Još nema finansijskih podataka"
        description="Ovde će se prikazivati troškovi, uplate i zarada."
      />
    </>
  );
}
