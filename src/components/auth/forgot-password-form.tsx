"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useForm, useWatch } from "react-hook-form";

import { FormAlert } from "@/components/auth/form-alert";
import { SubmitButton } from "@/components/auth/submit-button";
import { TurnstileCaptcha } from "@/components/auth/turnstile-captcha";
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
import { getTurnstileSiteKey } from "@/config/captcha";
import { useActionSubmit } from "@/hooks/use-action-submit";
import { requestPasswordResetAction } from "@/lib/auth/actions";
import { publicErrorMessage } from "@/lib/auth/messages";
import { forgotPasswordSchema, type ForgotPasswordInput } from "@/lib/validations/auth";

export function ForgotPasswordForm() {
  const turnstileSiteKey = getTurnstileSiteKey();
  const searchParams = useSearchParams();
  const linkError = publicErrorMessage(searchParams.get("error"));

  const form = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: "onTouched",
    defaultValues: { email: "", captchaToken: undefined },
  });
  const { submit, isPending, result } = useActionSubmit(form, requestPasswordResetAction);
  const captchaToken = useWatch({ control: form.control, name: "captchaToken" });
  const setCaptchaToken = useCallback(
    (token: string | undefined) => form.setValue("captchaToken", token),
    [form],
  );

  if (result?.ok) {
    return (
      <div className="space-y-4">
        <FormAlert variant="success">{result.message}</FormAlert>
        <p className="text-center text-sm">
          <Link href={routes.login} className="font-medium text-primary hover:underline">
            Nazad na prijavu
          </Link>
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
        {result && !result.ok && result.message ? (
          <FormAlert variant="error">{result.message}</FormAlert>
        ) : linkError ? (
          <FormAlert variant="error">{linkError}</FormAlert>
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

        {turnstileSiteKey ? (
          <TurnstileCaptcha
            siteKey={turnstileSiteKey}
            onTokenChange={setCaptchaToken}
            resetKey={result}
          />
        ) : null}

        <SubmitButton
          pending={isPending}
          disabled={Boolean(turnstileSiteKey && !captchaToken)}
          pendingLabel="Šaljemo…"
        >
          Pošalji uputstvo
        </SubmitButton>

        <p className="text-center text-sm text-muted-foreground">
          Setili ste se lozinke?{" "}
          <Link href={routes.login} className="font-medium text-primary hover:underline">
            Prijavite se
          </Link>
        </p>
      </form>
    </Form>
  );
}
