# Poslovođa

Mobile-first B2B SaaS for tradespeople and small field-service companies in
Serbia: clients, jobs, quotes, expenses, payments, crews and profit per job.

> **Status:** Phase 3: authentication (register, confirm, login, password
> reset, sign-out), company onboarding and active-organization selection.
> Business modules (clients, jobs, quotes, finances) are empty screens. See
> [docs/PRODUCT.md](docs/PRODUCT.md).

## Tech stack

Next.js 16 (App Router) · TypeScript (strict) · Tailwind CSS v4 · shadcn/ui ·
Supabase JS · Zod · React Hook Form · Vitest · Playwright · ESLint · Prettier

## Requirements

- Node.js 20.9+ (22 LTS recommended)
- npm 10+
- Docker (Docker Desktop, OrbStack, Colima, …), only for the local Supabase stack

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in values (see "Local Supabase")
npm run dev
```

Open http://localhost:3000.

To run E2E tests locally the first time, install the Playwright browser:

```bash
npx playwright install chromium
```

## Scripts

| Script                     | What it does                                                             |
| -------------------------- | ------------------------------------------------------------------------ |
| `npm run dev`              | Start the dev server                                                     |
| `npm run build`            | Production build                                                         |
| `npm run start`            | Serve the production build                                               |
| `npm run lint`             | ESLint                                                                   |
| `npm run typecheck`        | Generate Next route types, then `tsc --noEmit`                           |
| `npm run format`           | Format with Prettier                                                     |
| `npm run format:check`     | Check formatting                                                         |
| `npm run test`             | Unit tests (Vitest, single run)                                          |
| `npm run test:watch`       | Unit tests in watch mode                                                 |
| `npm run test:e2e`         | Build, start on :3100 and run Playwright (desktop + mobile + auth flows) |
| `npm run test:e2e:auth`    | Only the full auth flows (needs the local Supabase stack)                |
| `npm run test:integration` | HTTP tests against the local Supabase stack                              |
| `npm run db:*`             | Local Supabase: `start`, `stop`, `reset`, `test`, `lint`, `types`        |
| `npm run check`            | lint + typecheck + format:check + unit tests                             |

Set `PLAYWRIGHT_SKIP_BUILD=1` to run E2E against an existing `next build`.

## Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request to
`main`, on pushes to `main` and manually (`workflow_dispatch`). The job uses
Node.js 22, installs dependencies with `npm ci` and runs:

1. `npm run format:check`
2. `npm run lint`
3. `npm run typecheck`
4. `npm run test` (unit tests)
5. `npm run build` (production build, with placeholder public env values only)

The workflow has read-only permissions and uses no secrets. A new push cancels
the previous run for the same pull request.

**Next CI phase:** SQL (pgTAP), integration and Playwright tests need the full
local Supabase stack in Docker, so CI doesn't run them yet. Run them locally
before merging:

```bash
npm run db:start && npm run db:test && npm run test:integration && npm run test:e2e
```

## Local Supabase

The Supabase CLI is a dev dependency (`npx supabase ...`); no global install
is needed.

```bash
npm run db:start      # first run downloads Docker images (a few minutes)
```

The command prints URLs and keys. Copy them into `.env.local`:

```bash
npx supabase status
```

| `supabase status`                      | `.env.local`                           |
| -------------------------------------- | -------------------------------------- |
| API URL (`http://127.0.0.1:54321`)     | `NEXT_PUBLIC_SUPABASE_URL`             |
| Publishable key (`sb_publishable_...`) | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Secret key (`sb_secret_...`)           | `SUPABASE_SECRET_KEY`                  |

The local keys are the well-known development keys of the CLI. Never use
hosted-project keys in tests.

Useful commands:

```bash
npm run db:reset          # re-apply all migrations + supabase/seed.sql
npm run db:test           # pgTAP database tests
npm run test:integration  # HTTP tests against the local stack (auto-reads `supabase status`)
npm run db:types          # regenerate src/types/database.ts after schema changes
npm run db:lint           # lint SQL functions
npm run db:stop
```

Studio (DB browser): http://127.0.0.1:54323. Seed accounts (password
`poslovodja-dev-123`): `vlasnik@poslovodja.test` (owner),
`radnik@poslovodja.test` (worker), `drugi@poslovodja.test` (other company).

Integration tests can also target a stack on custom ports by exporting
`SUPABASE_TEST_URL`, `SUPABASE_TEST_PUBLISHABLE_KEY` and
`SUPABASE_TEST_SECRET_KEY`. Only local URLs are accepted.

Schema changes: `npx supabase migration new <name>`, then edit the file and run
`npm run db:reset && npm run db:test && npm run db:types`. See
[docs/DATABASE.md](docs/DATABASE.md).

## Trying the auth flow locally

1. Start Supabase with `npm run db:start`, then run `npm run db:reset`.
2. Create `.env.local` from `.env.example`. Use the URL and keys from
   `npx supabase status`, with `NEXT_PUBLIC_SITE_URL=http://localhost:3000`.
3. Run `npm run dev` and open http://localhost:3000/register.
4. Read the confirmation email in **Mailpit** at http://127.0.0.1:54324 and
   click the link. You land on the onboarding form.
5. Or sign in with a seed account (password `poslovodja-dev-123`). The seed
   users already have organizations.

Use `localhost` (not `127.0.0.1`) consistently: auth cookies and the
configured redirect URLs are per host.

## Environment variables

See [.env.example](.env.example). Never commit real keys — `.env*` files other
than `.env.example` are git-ignored.

| Variable                               | Exposed to browser | Description                                                        |
| -------------------------------------- | ------------------ | ------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | yes                | Supabase API URL                                                   |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes                | Publishable (or legacy anon) key; RLS applies                      |
| `NEXT_PUBLIC_SITE_URL`                 | yes                | Public app URL for auth email links (e.g. `http://localhost:3000`) |
| `NEXT_PUBLIC_BASE_PATH`                | yes                | Optional build-time mount path (production: `/poslovodja`)         |
| `SUPABASE_SECRET_KEY`                  | **no**             | Secret (or legacy service_role) key; bypasses RLS; server only     |

In development the server logs which variables are missing (names only).
Pages that don't use Supabase keep working without them.

## Documentation

- [docs/PRODUCT.md](docs/PRODUCT.md) — product, users, modules, roadmap
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): structure, layout, conventions
- [docs/DATABASE.md](docs/DATABASE.md): tables, relations, RPCs, processes, commands
- [docs/AUTHENTICATION.md](docs/AUTHENTICATION.md): sign-up, login, reset, onboarding, active organization, route protection
- [docs/SECURITY.md](docs/SECURITY.md): roles, RLS, key handling, open risks
- [CLAUDE.md](CLAUDE.md) — rules for AI coding agents
