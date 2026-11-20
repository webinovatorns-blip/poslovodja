/** Shared user-facing validation messages (Serbian, Latin script). */
export const validationMessages = {
  required: "Ovo polje je obavezno.",
  invalidEmail: "Unesite ispravnu e-mail adresu.",
  invalidPhone: "Unesite ispravan broj telefona.",
  tooLong: (max: number) => `Najviše ${max} karaktera.`,
  passwordTooShort: (min: number) => `Lozinka mora imati najmanje ${min} karaktera.`,
  passwordTooLong: (max: number) => `Lozinka može imati najviše ${max} karaktera.`,
  passwordsDoNotMatch: "Lozinke se ne poklapaju.",
  termsRequired: "Morate prihvatiti uslove korišćenja i politiku privatnosti.",
  invalidChoice: "Izaberite jednu od ponuđenih opcija.",
  invalidTaxId: "PIB mora imati tačno 9 cifara.",
  invalidRegistrationNumber: "Matični broj mora imati tačno 8 cifara.",
  invalidPostalCode: "Unesite ispravan poštanski broj.",
} as const;
