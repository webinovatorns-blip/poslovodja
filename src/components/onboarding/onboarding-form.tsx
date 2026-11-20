"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useRef } from "react";
import { useForm, type Control, type FieldPath } from "react-hook-form";

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
import { NativeSelect } from "@/components/ui/native-select";
import { useActionSubmit } from "@/hooks/use-action-submit";
import { createOrganizationAction } from "@/lib/organizations/actions";
import {
  businessTypes,
  countries,
  currencies,
  onboardingDefaults,
  onboardingFormSchema,
  timezones,
  type OnboardingFormInput,
} from "@/lib/validations/onboarding";

type TextFieldProps = {
  control: Control<OnboardingFormInput>;
  name: FieldPath<OnboardingFormInput>;
  label: string;
  optional?: boolean;
} & Omit<React.ComponentProps<typeof Input>, "name">;

function TextField({ control, name, label, optional, ...inputProps }: TextFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>
            {label}
            {optional ? (
              <span className="font-normal text-muted-foreground">(opciono)</span>
            ) : null}
          </FormLabel>
          <FormControl>
            <Input {...inputProps} {...field} value={field.value ?? ""} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

type SelectFieldProps = {
  control: Control<OnboardingFormInput>;
  name: "businessType" | "countryCode" | "currency" | "timezone";
  label: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
};

function SelectField({ control, name, label, options, placeholder }: SelectFieldProps) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <NativeSelect {...field} value={field.value ?? ""}>
              {placeholder ? (
                <option value="" disabled>
                  {placeholder}
                </option>
              ) : null}
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function OnboardingForm() {
  const form = useForm<OnboardingFormInput>({
    resolver: zodResolver(onboardingFormSchema),
    mode: "onTouched",
    defaultValues: {
      name: "",
      businessType: "" as OnboardingFormInput["businessType"],
      countryCode: onboardingDefaults.countryCode,
      currency: onboardingDefaults.currency,
      timezone: onboardingDefaults.timezone,
      phone: "",
      email: "",
      taxId: "",
      registrationNumber: "",
      address: "",
      city: "",
      postalCode: "",
    },
  });

  // One key per form instance, reused for retries: if the first request
  // reached the server, the retry returns the same organization.
  const idempotencyKey = useRef<string | null>(null);
  const action = useCallback((values: OnboardingFormInput) => {
    idempotencyKey.current ??= crypto.randomUUID();
    return createOrganizationAction({
      ...values,
      idempotencyKey: idempotencyKey.current,
    });
  }, []);

  const { submit, isPending, result } = useActionSubmit(form, action);
  const { control } = form;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(submit)} noValidate className="space-y-8">
        {result && !result.ok && result.message ? (
          <FormAlert variant="error">{result.message}</FormAlert>
        ) : null}

        <fieldset className="space-y-4" disabled={isPending}>
          <legend className="mb-2 text-base font-semibold">Osnovni podaci</legend>
          <TextField
            control={control}
            name="name"
            label="Naziv firme ili radnje"
            autoComplete="organization"
          />
          <SelectField
            control={control}
            name="businessType"
            label="Vrsta delatnosti"
            options={businessTypes}
            placeholder="Izaberite delatnost"
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              control={control}
              name="countryCode"
              label="Država"
              options={countries}
            />
            <SelectField
              control={control}
              name="currency"
              label="Valuta"
              options={currencies}
            />
            <SelectField
              control={control}
              name="timezone"
              label="Vremenska zona"
              options={timezones}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4" disabled={isPending}>
          <legend className="mb-2 text-base font-semibold">Kontakt</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={control}
              name="phone"
              label="Telefon"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
            />
            <TextField
              control={control}
              name="email"
              label="E-mail firme"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
            />
          </div>
        </fieldset>

        <fieldset className="space-y-4" disabled={isPending}>
          <legend className="mb-2 text-base font-semibold">Podaci za račune</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={control}
              name="taxId"
              label="PIB"
              optional
              inputMode="numeric"
              autoComplete="off"
            />
            <TextField
              control={control}
              name="registrationNumber"
              label="Matični broj"
              optional
              inputMode="numeric"
              autoComplete="off"
            />
          </div>
          <TextField
            control={control}
            name="address"
            label="Adresa"
            optional
            autoComplete="street-address"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={control}
              name="city"
              label="Grad"
              optional
              autoComplete="address-level2"
            />
            <TextField
              control={control}
              name="postalCode"
              label="Poštanski broj"
              optional
              inputMode="numeric"
              autoComplete="postal-code"
            />
          </div>
        </fieldset>

        <SubmitButton pending={isPending} pendingLabel="Čuvamo firmu…">
          Sačuvaj i nastavi
        </SubmitButton>
      </form>
    </Form>
  );
}
