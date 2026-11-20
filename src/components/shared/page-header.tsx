import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  /**
   * Secondary actions, shown next to the title.
   */
  actions?: ReactNode;
  /**
   * The page's main action (e.g. "Novi posao"). Shown next to the title on
   * desktop; on phones it is pinned above the bottom navigation, within
   * thumb reach. Pass a full-width-friendly button.
   */
  primaryAction?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  description,
  actions,
  primaryAction,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-3 pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>

      {actions || primaryAction ? (
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          {primaryAction ? <div className="hidden md:block">{primaryAction}</div> : null}
        </div>
      ) : null}

      {primaryAction ? (
        <div
          data-slot="mobile-primary-action"
          className="fixed inset-x-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 md:hidden [&>*]:w-full"
        >
          {primaryAction}
        </div>
      ) : null}
    </header>
  );
}
