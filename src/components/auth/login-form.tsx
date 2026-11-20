"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import { signInAction } from "@/lib/auth/actions";
import { authMessages, publicErrorMessage } from "@/lib/auth/messages";
import { safeRedirectPath } from "@/lib/auth/redirects";
import { loginSchema, type LoginInput } from "@/lib/validations/auth";

/**
 * "Zapamti me" is intentionally not offered: @supabase/ssr keeps the session
 * in persistent cookies and refreshes it in the proxy; a session-only mode
 * would need custom cookie handling. "Odjava" ends the session on this device.
 */
export function LoginForm() {
  const searchParams = useSearchParams();
  // Only internal paths survive; anything else falls back to the default.
  const nextParam = searchParams.get("next");
  const next = nextParam ? safeRedirectPath(nextParam) : undefined;
  const linkError = publicErrorMessage(searchParams.get("error"));
  const signedOut = searchParams.get("signed_out") === "1";

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onTouched",
    defaultValues: { email: "", password: "", next },
  });
  const { submit, isPending, result } = useActionSubmit(form, signInAction);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
        {result && !result.ok && result.message ? (
          <FormAlert variant="error">{result.message}</FormAlert>
        ) : linkError ? (
          <FormAlert variant="error">{linkError}</FormAlert>
        ) : signedOut ? (
          <FormAlert variant="success">{authMessages.signedOut}</FormAlert>
        ) : null}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>E-mail</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between gap-2">
                <FormLabel>Lozinka</FormLabel>
                <Link
                  href={routes.forgotPassword}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Zaboravljena lozinka
                </Link>
              </div>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SubmitButton pending={isPending} pendingLabel="Prijavljivanje…">
          Prijavi se
        </SubmitButton>

        <p className="text-center text-sm text-muted-foreground">
          Nemate nalog?{" "}
          <Link
            href={routes.register}
            className="font-medium text-primary hover:underline"
          >
            Registrujte se
          </Link>
        </p>
      </form>
    </Form>
  );
}
