import { Briefcase, Plus } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Poslovi" };

export default function JobsPage() {
  return (
    <>
      <PageHeader
        title="Poslovi"
        description="Pratite poslove od dogovora do naplate."
        primaryAction={
          // Placeholder: enabled once the module is implemented.
          <Button variant="highlight" size="lg" disabled>
            <Plus aria-hidden="true" />
            Novi posao
          </Button>
        }
      />
      <EmptyState
        icon={Briefcase}
        title="Još nemate poslova"
        description="Ovde će se prikazivati svi vaši poslovi."
      />
    </>
  );
}
