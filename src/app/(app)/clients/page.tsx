import { Plus, Users } from "lucide-react";
import type { Metadata } from "next";

import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Klijenti" };

export default function ClientsPage() {
  return (
    <>
      <PageHeader
        title="Klijenti"
        description="Svi vaši klijenti na jednom mestu."
        primaryAction={
          // Placeholder: enabled once the module is implemented.
          <Button variant="highlight" size="lg" disabled>
            <Plus aria-hidden="true" />
            Novi klijent
          </Button>
        }
      />
      <EmptyState
        icon={Users}
        title="Još nemate klijenata"
        description="Dodajte prvog klijenta kada modul bude dostupan."
      />
    </>
  );
}
