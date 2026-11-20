import { describe, expect, it } from "vitest";

import {
  forgotPasswordSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validations/auth";
import { validationMessages } from "@/lib/validations/messages";
import { onboardingFormSchema, onboardingSchema } from "@/lib/validations/onboarding";

const validRegistration = {
  fullName: "Marko Marković",
  email: "marko@primer.rs",
  password: "dugacka-lozinka",
  confirmPassword: "dugacka-lozinka",
  acceptTerms: true,
};

// First message per field, exactly like fieldErrorsOf() used by the server actions.
function errorsOf(result: {
  success: boolean;
  error?: { issues: { path: PropertyKey[]; message: string }[] };
}) {
  const errors: Record<string, string> = {};
  for (const issue of result.error?.issues ?? []) {
    errors[issue.path.join(".")] ??= issue.message;
  }
  return errors;
}

describe("registerSchema", () => {
  it("[1] accepts a valid registration", () => {
    const result = registerSchema.safeParse(validRegistration);
    expect(result.success).toBe(true);
  });

  it("requires the full name", () => {
    const result = registerSchema.safeParse({ ...validRegistration, fullName: "   " });
    expect(errorsOf(result).fullName).toBe(validationMessages.required);
  });

  it("[2] rejects an invalid email", () => {
    const result = registerSchema.safeParse({ ...validRegistration, email: "marko@" });
    expect(errorsOf(result).email).toBe(validationMessages.invalidEmail);
  });

  it("[3] rejects a password shorter than 10 characters", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      password: "kratka123",
      confirmPassword: "kratka123",
    });
    expect(errorsOf(result).password).toBe(validationMessages.passwordTooShort(10));
  });

  it("rejects passwords longer than 72 bytes (bcrypt limit)", () => {
    const long = "š".repeat(40); // 80 bytes in UTF-8
    const result = registerSchema.safeParse({
      ...validRegistration,
      password: long,
      confirmPassword: long,
    });
    expect(errorsOf(result).password).toBe(validationMessages.passwordTooLong(72));
  });

  it("[4] rejects mismatching passwords on the confirmation field", () => {
    const result = registerSchema.safeParse({
      ...validRegistration,
      confirmPassword: "druga-lozinka-123",
    });
    expect(errorsOf(result).confirmPassword).toBe(validationMessages.passwordsDoNotMatch);
  });

  it("[5] requires accepting the terms", () => {
    const result = registerSchema.safeParse({ ...validRegistration, acceptTerms: false });
    expect(errorsOf(result).acceptTerms).toBe(validationMessages.termsRequired);
  });
});

describe("password reset schemas", () => {
  it("forgot password requires a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "x" }).success).toBe(false);
    expect(forgotPasswordSchema.safeParse({ email: "x@primer.rs" }).success).toBe(true);
  });

  it("new password uses the same rules as registration", () => {
    expect(
      errorsOf(
        resetPasswordSchema.safeParse({ password: "kratka", confirmPassword: "kratka" }),
      ).password,
    ).toBe(validationMessages.passwordTooShort(10));
    expect(
      errorsOf(
        resetPasswordSchema.safeParse({
          password: "dugacka-lozinka",
          confirmPassword: "druga-lozinka-1",
        }),
      ).confirmPassword,
    ).toBe(validationMessages.passwordsDoNotMatch);
  });
});

describe("onboardingSchema", () => {
  const validOnboarding = {
    idempotencyKey: "6f1c1d3a-2b4e-4f6a-9c8d-1e2f3a4b5c6d",
    name: "Klima Servis Marko",
    businessType: "hvac_service",
    countryCode: "RS",
    currency: "RSD",
    timezone: "Europe/Belgrade",
    phone: "064 123 4567",
    email: "info@klima.rs",
    taxId: "",
    registrationNumber: "",
    address: "",
    city: "",
    postalCode: "",
  };

  it("accepts a minimal valid form and drops empty optional fields", () => {
    const result = onboardingSchema.safeParse(validOnboarding);
    expect(result.success).toBe(true);
    expect(result.data?.taxId).toBeUndefined();
    expect(result.data?.city).toBeUndefined();
  });

  it("[14] validates required fields", () => {
    const result = onboardingFormSchema.safeParse({
      ...validOnboarding,
      name: "",
      businessType: "",
      phone: "",
      email: "",
    });
    const errors = errorsOf(result);
    expect(errors.name).toBe(validationMessages.required);
    expect(errors.businessType).toBe(validationMessages.invalidChoice);
    expect(errors.phone).toBe(validationMessages.required);
    expect(errors.email).toBe(validationMessages.required);
  });

  it("validates optional PIB and matični broj formats when provided", () => {
    const errors = errorsOf(
      onboardingSchema.safeParse({
        ...validOnboarding,
        taxId: "12345",
        registrationNumber: "12",
      }),
    );
    expect(errors.taxId).toBe(validationMessages.invalidTaxId);
    expect(errors.registrationNumber).toBe(validationMessages.invalidRegistrationNumber);
  });

  it("only allows known countries, currencies, time zones and business types", () => {
    const errors = errorsOf(
      onboardingSchema.safeParse({
        ...validOnboarding,
        countryCode: "XX",
        currency: "BTC",
        timezone: "Mars/Base",
        businessType: "nuclear",
      }),
    );
    expect(Object.keys(errors).sort()).toEqual(
      ["businessType", "countryCode", "currency", "timezone"].sort(),
    );
  });

  it("requires a valid idempotency key on the server schema", () => {
    expect(
      onboardingSchema.safeParse({ ...validOnboarding, idempotencyKey: "1" }).success,
    ).toBe(false);
  });
});
