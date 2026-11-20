import { FileText, Plus } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Ponude" };

export default function QuotesPage() {
  return (
    <>
      <PageHeader
        title="Ponude"
        description="Ponude poslate klijentima."
        primaryAction={
          // Placeholder: enabled once the module is implemented.
          <Button variant="highlight" size="lg" disabled>
            <Plus aria-hidden="true" />
            Nova ponuda
          </Button>
        }
      />
      <EmptyState
        icon={FileText}
        title="Još nemate ponuda"
        description="Ovde će se prikazivati sve vaše ponude."
      />
    </>
  );
}
