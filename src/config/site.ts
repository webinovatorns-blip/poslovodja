export const siteConfig = {
  name: "Poslovođa",
  description:
    "Klijenti, poslovi, ponude, troškovi i zarada po poslu — na jednom mestu, za majstore i terenske firme.",
  locale: "sr-Latn-RS",
} as const;

/**
 * Placeholder identity shown in the app shell until authentication and
 * company profiles exist. Replace with real session data in the auth phase.
 */
export const placeholderSession = {
  companyName: "Moja firma",
  userName: "Korisnik",
  userEmail: "",
} as const;
