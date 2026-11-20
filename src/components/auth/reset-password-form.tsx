"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useForm } from "react-hook-form";

import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { routes } from "@/config/navigation";
import { useActionSubmit } from "@/hooks/use-action-submit";
import { updatePasswordAction } from "@/lib/auth/actions";
import {
  PASSWORD_MIN_LENGTH,
  resetPasswordSchema,
  type ResetPasswordInput,
} from "@/lib/validations/auth";

export function ResetPasswordForm() {
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    mode: "onTouched",
    defaultValues: { password: "", confirmPassword: "" },
  });
  const { submit, isPending, result } = useActionSubmit(form, updatePasswordAction);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
        {result && !result.ok && result.message ? (
          <FormAlert variant="error">
            {result.message}{" "}
            <Link href={routes.forgotPassword} className="font-medium underline">
              Zatraži novi link
            </Link>
          </FormAlert>
        ) : null}

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nova lozinka</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                Najmanje {PASSWORD_MIN_LENGTH} karaktera.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="confirmPassword"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Potvrda nove lozinke</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SubmitButton pending={isPending} pendingLabel="Čuvamo…">
          Sačuvaj novu lozinku
        </SubmitButton>
      </form>
    </Form>
  );
}
