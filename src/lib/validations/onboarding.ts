import { z } from "zod";

import { emailField, optionalText, phoneField, requiredText } from "./common";
import { validationMessages } from "./messages";

/**
 * Keys must match private.is_valid_business_type() in the database
 * (migration 20261121100000_onboarding_create_organization.sql).
 */
export const businessTypes = [
  { value: "hvac_service", label: "Klima-servis" },
  { value: "electrical", label: "Elektroinstalacije" },
  { value: "plumbing", label: "Vodoinstalacije" },
  { value: "renovation", label: "Renoviranje" },
  { value: "painting", label: "Molerski radovi" },
  { value: "tiling", label: "Keramičarski radovi" },
  { value: "carpentry", label: "Stolarija" },
  { value: "other", label: "Ostalo" },
] as const;

export const countries = [
  { value: "RS", label: "Srbija" },
  { value: "ME", label: "Crna Gora" },
  { value: "BA", label: "Bosna i Hercegovina" },
  { value: "HR", label: "Hrvatska" },
  { value: "MK", label: "Severna Makedonija" },
  { value: "SI", label: "Slovenija" },
] as const;

export const currencies = [
  { value: "RSD", label: "RSD — srpski dinar" },
  { value: "EUR", label: "EUR — evro" },
  { value: "BAM", label: "BAM — konvertibilna marka" },
  { value: "MKD", label: "MKD — makedonski denar" },
] as const;

export const timezones = [
  { value: "Europe/Belgrade", label: "Beograd (CET)" },
  { value: "Europe/Podgorica", label: "Podgorica (CET)" },
  { value: "Europe/Sarajevo", label: "Sarajevo (CET)" },
  { value: "Europe/Zagreb", label: "Zagreb (CET)" },
  { value: "Europe/Skopje", label: "Skoplje (CET)" },
  { value: "Europe/Ljubljana", label: "Ljubljana (CET)" },
] as const;

export const onboardingDefaults = {
  countryCode: "RS",
  currency: "RSD",
  timezone: "Europe/Belgrade",
} as const;

type Option = { readonly value: string };
function oneOf<const T extends readonly Option[]>(options: T) {
  const values = options.map((option) => option.value) as [
    T[number]["value"],
    ...T[number]["value"][],
  ];
  return z.enum(values, { error: validationMessages.invalidChoice });
}

export const onboardingSchema = z.object({
  /** Client-generated per form instance; makes the create call idempotent. */
  idempotencyKey: z.uuid(),
  name: requiredText(200),
  businessType: oneOf(businessTypes),
  countryCode: oneOf(countries),
  currency: oneOf(currencies),
  timezone: oneOf(timezones),
  phone: phoneField,
  email: emailField,
  taxId: optionalText(9, { regex: /^\d{9}$/, message: validationMessages.invalidTaxId }),
  registrationNumber: optionalText(8, {
    regex: /^\d{8}$/,
    message: validationMessages.invalidRegistrationNumber,
  }),
  address: optionalText(300),
  city: optionalText(100),
  postalCode: optionalText(16, {
    regex: /^[0-9A-Za-z -]{3,16}$/,
    message: validationMessages.invalidPostalCode,
  }),
});

export type OnboardingInput = z.input<typeof onboardingSchema>;
export type OnboardingValues = z.output<typeof onboardingSchema>;

/** What the form collects; the idempotency key is attached on submit. */
export const onboardingFormSchema = onboardingSchema.omit({ idempotencyKey: true });

export type OnboardingFormInput = z.input<typeof onboardingFormSchema>;
