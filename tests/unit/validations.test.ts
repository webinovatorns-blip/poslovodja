import { describe, expect, it } from "vitest";

import { emailField, phoneField, requiredText } from "@/lib/validations/common";
import { validationMessages } from "@/lib/validations/messages";

function firstError(result: {
  success: boolean;
  error?: { issues: { message: string }[] };
}) {
  return result.error?.issues[0]?.message;
}

describe("requiredText", () => {
  it("trims and rejects empty values with a Serbian message", () => {
    const schema = requiredText(10);
    expect(schema.parse("  Marko  ")).toBe("Marko");
    expect(firstError(schema.safeParse("   "))).toBe(validationMessages.required);
    expect(firstError(schema.safeParse("a".repeat(11)))).toBe(
      validationMessages.tooLong(10),
    );
  });
});

describe("emailField", () => {
  it("accepts valid and rejects invalid addresses", () => {
    expect(emailField.parse(" majstor@primer.rs ")).toBe("majstor@primer.rs");
    expect(firstError(emailField.safeParse("nije-email"))).toBe(
      validationMessages.invalidEmail,
    );
    expect(firstError(emailField.safeParse(""))).toBe(validationMessages.required);
  });
});

describe("phoneField", () => {
  it.each(["064 123 4567", "+381 64 1234567", "011/123-456"])("accepts %s", (value) => {
    expect(phoneField.safeParse(value).success).toBe(true);
  });

  it.each(["12345", "abc 123 456", "+381 64 1234567 99999"])("rejects %s", (value) => {
    expect(firstError(phoneField.safeParse(value))).toBe(validationMessages.invalidPhone);
  });
});
