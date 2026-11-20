import { SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <EmptyState
        className="w-full"
        icon={SearchX}
        title="Stranica nije pronađena"
        description="Stranica koju tražite ne postoji ili je premeštena."
        action={
          <Button asChild>
            <Link href="/">Nazad na početnu</Link>
          </Button>
        }
      />
    </main>
  );
}
