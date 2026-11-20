# Product: Poslovođa

## What it is

Poslovođa is a mobile-optimized B2B SaaS app for tradespeople ("majstori") and
small field-service companies in Serbia: electricians, plumbers, painters,
HVAC installers, renovation crews and similar.

It replaces notebooks, Viber threads and spreadsheets with one place to manage
the business side of the work.

## Target users

- **Owner / lead tradesperson** — runs a one-person business or a small crew
  (2–15 people). Works mostly from a phone, often on site, with dirty hands or
  gloves. Needs answers fast: "Who owes me money?", "Did this job make a profit?"
- **Office helper** (optional) — partner or assistant doing quotes and payments
  from a laptop.
- **Crew member** (later) — limited view of assigned jobs.

## Planned modules

| Module (UI label)      | Route        | Purpose                                               |
| ---------------------- | ------------ | ----------------------------------------------------- |
| Pregled (dashboard)    | `/dashboard` | Active jobs, outstanding payments, profit at a glance |
| Klijenti (clients)     | `/clients`   | Contacts, addresses, history per client               |
| Poslovi (jobs)         | `/jobs`      | Job lifecycle from agreement to payment               |
| Ponude (quotes)        | `/quotes`    | Create and send quotes, convert to jobs               |
| Finansije (finances)   | `/finances`  | Expenses, incoming payments, profit per job           |
| Ekipa (team)           | `/team`      | Crew members, assignment to jobs                      |
| Podešavanja (settings) | `/settings`  | Company profile, account                              |

Supporting flows: marketing page (`/`), login (`/login`), registration
(`/register`), onboarding (`/onboarding`).

## Core value: profit per job

Every job collects its quote, expenses (material, labor, transport) and
payments, so the owner sees the real margin of each job — not just revenue.

## Product principles

- **Mobile first.** Designed for a phone in one hand. The main action of each
  screen sits at the bottom, within thumb reach. Desktop is a comfortable
  secondary experience.
- **Serbian, Latin script.** All user-facing text is in Serbian (latinica).
  Currency RSD, Serbian date and number formats.
- **Simple over complete.** Fewer fields, clear defaults, no jargon.
- **Fast and calm.** No unnecessary animations. Readable on a sunny site.

## Visual identity

- Primary: dark navy (`--primary`)
- Accent: orange (`--highlight`) for the most important call to action
- Light background, white cards
- Font: Inter (with `latin-ext` for č, ć, đ, š, ž)
- Icons: Lucide

## Roadmap (phases)

1. **Technical foundation** — project setup, layout, empty pages, shared
   components, tests. _(done)_
2. **Multi-tenant database foundation** — organizations, memberships, roles,
   invitations, RLS, RPCs, database tests. _(done)_
3. **Authentication & onboarding** — sign-up with email confirmation, login,
   password reset, sign-out, company onboarding, active-organization picker,
   route protection. _(current phase, done; invitations UI still open)_
4. **Business modules** — clients → jobs → quotes → finances → team.
