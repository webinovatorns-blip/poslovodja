/**
 * User-facing auth/onboarding messages (Serbian, Latin script).
 * Server code maps errors to these by CODE; raw Supabase/Postgres messages
 * are never shown to users.
 */
export const authMessages = {
  generic: "Došlo je do greške. Pokušajte ponovo za nekoliko trenutaka.",
  invalidCredentials: "Pogrešan e-mail ili lozinka.",
  emailNotConfirmed:
    "E-mail adresa još nije potvrđena. Proverite poštu i kliknite na link za potvrdu.",
  rateLimited: "Previše pokušaja. Sačekajte malo pa pokušajte ponovo.",
  captchaRequired: "Potvrdite bezbednosnu proveru i pokušajte ponovo.",
  weakPassword: "Lozinka nije dovoljno jaka. Izaberite dužu ili složeniju lozinku.",
  samePassword: "Nova lozinka mora biti različita od trenutne.",
  signUpCheckEmail:
    "Proverite e-mail. Poslali smo link za potvrdu na adresu koju ste uneli. Ako nalog sa tom adresom već postoji, prijavite se ili zatražite novu lozinku.",
  passwordResetSent:
    "Ako postoji nalog sa ovom adresom, poslali smo uputstvo za promenu lozinke.",
  passwordUpdated: "Lozinka je promenjena.",
  linkInvalid: "Link nije važeći ili je istekao. Zatražite novi.",
  resetLinkInvalid:
    "Link za promenu lozinke nije važeći ili je istekao. Zatražite novi link.",
  signedOut: "Odjavili ste se.",
  sessionExpired: "Sesija je istekla. Prijavite se ponovo.",
  configurationMissing:
    "Prijava trenutno nije dostupna. Pokušajte kasnije ili kontaktirajte podršku.",
  organizationCreateFailed:
    "Firmu nije bilo moguće sačuvati. Proverite podatke i pokušajte ponovo.",
  organizationAccessDenied: "Nemate pristup toj organizaciji.",
  organizationsUnavailable:
    "Trenutno ne možemo da učitamo podatke vaše firme. Pokušajte ponovo za nekoliko trenutaka.",
  callbackUnavailable:
    "Servis za prijavu trenutno ne odgovara, pa link nismo mogli da proverimo. Pokušajte ponovo za nekoliko trenutaka.",
  authUnavailable:
    "Trenutno ne možemo da proverimo vašu prijavu. Pokušajte ponovo za nekoliko trenutaka.",
} as const;

/** Error keys that may appear in `?error=` on public pages. Anything else is ignored. */
export const publicErrorMessages = {
  link_invalid: authMessages.linkInvalid,
  reset_link_invalid: authMessages.resetLinkInvalid,
  session_expired: authMessages.sessionExpired,
} as const;

export type PublicErrorKey = keyof typeof publicErrorMessages;

export function publicErrorMessage(key: string | null | undefined): string | null {
  if (!key || !Object.hasOwn(publicErrorMessages, key)) return null;
  return publicErrorMessages[key as PublicErrorKey];
}
