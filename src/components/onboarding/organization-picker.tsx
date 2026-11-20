"use client";

import { Building2, ChevronRight } from "lucide-react";
import { useState, useTransition } from "react";

import { FormAlert } from "@/components/auth/form-alert";
import { switchOrganizationAction } from "@/lib/organizations/actions";

type OrganizationPickerProps = {
  organizations: { id: string; name: string; roleLabel: string }[];
  next?: string;
};

export function OrganizationPicker({ organizations, next }: OrganizationPickerProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(id: string) {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await switchOrganizationAction(id, next);
      if (result && !result.ok) setError(result.message ?? null);
    });
  }

  return (
    <div className="space-y-4">
      {error ? <FormAlert variant="error">{error}</FormAlert> : null}
      <ul className="space-y-2">
        {organizations.map((organization) => (
          <li key={organization.id}>
            <button
              type="button"
              onClick={() => choose(organization.id)}
              disabled={isPending}
              className="flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary">
                <Building2 className="size-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{organization.name}</span>
                <span className="block text-sm text-muted-foreground">
                  {organization.roleLabel}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
