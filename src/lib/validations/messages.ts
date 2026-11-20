/** Shared user-facing validation messages (Serbian, Latin script). */
export const validationMessages = {
  required: "Ovo polje je obavezno.",
  invalidEmail: "Unesite ispravnu e-mail adresu.",
  invalidPhone: "Unesite ispravan broj telefona.",
  tooLong: (max: number) => `Najviše ${max} karaktera.`,
} as const;
