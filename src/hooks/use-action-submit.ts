"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import type { ActionResult } from "@/lib/auth/action-result";

/**
 * Submits form values to a server action exactly once at a time.
 *
 * - A ref guard blocks re-entry synchronously (a fast double click fires two
 *   events before React re-renders the disabled button).
 * - `isPending` drives the loading state and disables the submit button.
 * - Server-side field errors are applied to the form; the form-level
 *   message is returned for an alert. Successful redirects never return.
 */
export function useActionSubmit<TValues extends FieldValues>(
  form: UseFormReturn<TValues>,
  action: (values: TValues) => Promise<ActionResult>,
) {
  const inFlight = useRef(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  const submit = useCallback(
    (values: TValues) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setResult(null);

      startTransition(async () => {
        try {
          const response = await action(values);
          if (!response) return;
          if (!response.ok && response.fieldErrors) {
            for (const [field, message] of Object.entries(response.fieldErrors)) {
              form.setError(field as Path<TValues>, { type: "server", message });
            }
          }
          setResult(response);
        } finally {
          inFlight.current = false;
        }
      });
    },
    [action, form],
  );

  return { submit, isPending, result };
}
