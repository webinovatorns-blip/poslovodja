"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useState, useTransition } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchOrganizationAction } from "@/lib/organizations/actions";

export type OrganizationOption = { id: string; name: string };

type OrganizationSwitcherProps = {
  activeOrganizationId: string;
  activeOrganizationName: string;
  organizations: OrganizationOption[];
};

/**
 * Shows the active organization; lets members of several organizations
 * switch. The server verifies membership before storing the choice.
 */
export function OrganizationSwitcher({
  activeOrganizationId,
  activeOrganizationName,
  organizations,
}: OrganizationSwitcherProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const label = (
    <span className="truncate text-base font-semibold" data-testid="company-name">
      {activeOrganizationName}
    </span>
  );

  if (organizations.length < 2) {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <Building2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
        {label}
      </div>
    );
  }

  function choose(id: string) {
    if (id === activeOrganizationId || isPending) return;
    setError(null);
    startTransition(async () => {
      const result = await switchOrganizationAction(id);
      if (result && !result.ok) setError(result.message ?? null);
    });
  }

  return (
    <div className="min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Aktivna organizacija: ${activeOrganizationName}. Promeni organizaciju`}
          disabled={isPending}
          className="flex h-10 max-w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
        >
          <Building2 className="size-5 shrink-0 text-primary" aria-hidden="true" />
          {label}
          <ChevronsUpDown
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Vaše organizacije</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {organizations.map((organization) => {
            const active = organization.id === activeOrganizationId;
            return (
              <DropdownMenuItem
                key={organization.id}
                className="h-11"
                aria-current={active ? "true" : undefined}
                onSelect={() => choose(organization.id)}
              >
                <Check
                  className={active ? "text-primary" : "invisible"}
                  aria-hidden="true"
                />
                <span className="truncate">{organization.name}</span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {error ? (
        <p role="alert" className="sr-only">
          {error}
        </p>
      ) : null}
    </div>
  );
}
