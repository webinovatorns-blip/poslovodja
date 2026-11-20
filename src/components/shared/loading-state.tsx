import { Loader2 } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type LoadingStateProps = {
  /** Visible and screen-reader label. */
  label?: string;
  /** Number of placeholder rows to show under the label. */
  rows?: number;
  className?: string;
};

export function LoadingState({
  label = "Učitavanje…",
  rows = 3,
  className,
}: LoadingStateProps) {
  return (
    <div role="status" aria-live="polite" className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2
          className="size-4 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
        <span>{label}</span>
      </div>
      <div className="space-y-3" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
