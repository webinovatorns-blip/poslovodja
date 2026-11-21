"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MailCheck } from "lucide-react";
import Link from "next/link";
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
import { signUpAction } from "@/lib/auth/actions";
import {
  PASSWORD_MIN_LENGTH,
  registerSchema,
  type RegisterInput,
} from "@/lib/validations/auth";

export function RegisterForm() {
  const turnstileSiteKey = getTurnstileSiteKey();
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: "onTouched",
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
      acceptTerms: false,
      captchaToken: undefined,
    },
  });
  const { submit, isPending, result } = useActionSubmit(form, signUpAction);
  const captchaToken = useWatch({ control: form.control, name: "captchaToken" });
  const setCaptchaToken = useCallback(
    (token: string | undefined) => form.setValue("captchaToken", token),
    [form],
  );

  if (result?.ok) {
    return (
      <div className="space-y-4">
        <FormAlert variant="success">
          <p className="font-medium">Nalog je skoro spreman</p>
          <p className="mt-1">{result.message}</p>
        </FormAlert>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <MailCheck className="size-4" aria-hidden="true" />
          Ne vidite poruku? Proverite i folder za neželjenu poštu.
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-4">
        {result && !result.ok && result.message ? (
          <FormAlert variant="error">{result.message}</FormAlert>
        ) : null}

        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ime i prezime</FormLabel>
              <FormControl>
                <Input autoComplete="name" autoCapitalize="words" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
              <FormLabel>Lozinka</FormLabel>
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
              <FormLabel>Potvrda lozinke</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="acceptTerms"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-start gap-3">
                <FormControl>
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-input accent-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                    checked={field.value}
                    onChange={(event) => field.onChange(event.target.checked)}
                    onBlur={field.onBlur}
                    name={field.name}
                    ref={field.ref}
                  />
                </FormControl>
                <FormLabel className="leading-snug font-normal">
                  Prihvatam uslove korišćenja i politiku privatnosti.
                </FormLabel>
              </div>
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
          pendingLabel="Pravimo nalog…"
        >
          Napravi nalog
        </SubmitButton>

        <p className="text-center text-sm text-muted-foreground">
          Već imate nalog?{" "}
          <Link href={routes.login} className="font-medium text-primary hover:underline">
            Prijavite se
          </Link>
        </p>
      </form>
    </Form>
  );
}
