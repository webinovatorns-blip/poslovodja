"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { authMessages } from "@/lib/auth/messages";

import { ErrorState } from "./error-state";

/**
 * Shown when the user's memberships could not be read (temporary database
 * or API error). Deliberately NOT "no organization": retrying re-runs the
 * server guards once the read succeeds.
 */
export function MembershipsUnavailableState({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <ErrorState
      title="Organizacije trenutno nisu dostupne"
      description={authMessages.membershipsUnavailable}
      retryLabel={isPending ? "Učitavanje…" : "Pokušaj ponovo"}
      onRetry={() => startTransition(() => router.refresh())}
      className={className}
    />
  );
}
