import { AlertCircle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

type FormAlertProps = {
  variant: "error" | "success" | "info";
  children: React.ReactNode;
  className?: string;
};

/** Form-level message. Errors are announced immediately (role="alert"). */
export function FormAlert({ variant, children, className }: FormAlertProps) {
  const Icon = variant === "error" ? AlertCircle : CheckCircle2;
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border p-3 text-sm",
        variant === "error" && "border-destructive/30 bg-destructive/5 text-destructive",
        variant === "success" &&
          "border-primary/20 bg-secondary text-secondary-foreground",
        variant === "info" && "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
