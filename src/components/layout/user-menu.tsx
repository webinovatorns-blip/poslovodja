"use client";

import { ChevronDown, LogOut, Settings } from "lucide-react";
import Link from "next/link";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { routes } from "@/config/navigation";

type UserMenuProps = {
  userName: string;
  userEmail?: string;
};

function getInitials(name: string): string {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials || "?";
}

export function UserMenu({ userName, userEmail }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Korisnički meni"
        className="flex h-10 cursor-pointer items-center gap-2 rounded-full pr-1 pl-1 outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:pr-2"
      >
        <span
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {getInitials(userName)}
        </span>
        <span className="hidden text-sm font-medium sm:inline">{userName}</span>
        <ChevronDown
          className="hidden size-4 text-muted-foreground sm:block"
          aria-hidden="true"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <span className="block truncate">{userName}</span>
          {userEmail ? (
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {userEmail}
            </span>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={routes.settings}>
            <Settings aria-hidden="true" />
            Podešavanja
          </Link>
        </DropdownMenuItem>
        {/* TODO(auth phase): replace with a real sign-out action. */}
        <DropdownMenuItem asChild>
          <Link href={routes.login}>
            <LogOut aria-hidden="true" />
            Odjava
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
