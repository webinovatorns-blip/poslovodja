import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

type SubmitButtonProps = {
  pending: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  pendingLabel?: string;
};

/** Full-width primary submit button with a loading state. */
export function SubmitButton({
  pending,
  disabled = false,
  children,
  pendingLabel,
}: SubmitButtonProps) {
  return (
    <Button
      type="submit"
      size="lg"
      className="w-full"
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? (
        <>
          <Loader2
            className="animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          {pendingLabel ?? "Molimo sačekajte…"}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
