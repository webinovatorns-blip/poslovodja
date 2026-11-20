# Architecture

## Stack

| Concern          | Choice                                                            |
| ---------------- | ----------------------------------------------------------------- |
| Framework        | Next.js 16 (App Router, Turbopack, Cache Components enabled)      |
| Language         | TypeScript, `strict: true`                                        |
| Styling          | Tailwind CSS v4 (CSS-first config in `src/app/globals.css`)       |
| UI primitives    | shadcn/ui (new-york style, Radix UI via the `radix-ui` package)   |
| Icons            | lucide-react                                                      |
| Forms            | React Hook Form + Zod (`@hookform/resolvers`)                     |
| Backend (future) | Supabase via `@supabase/supabase-js` + `@supabase/ssr`            |
| Unit tests       | Vitest + Testing Library (jsdom)                                  |
| E2E tests        | Playwright (desktop + mobile projects)                            |
| Quality          | ESLint (next core-web-vitals + TS) + Prettier (+ tailwind plugin) |

## Directory layout

```
src/
  app/                     Routes (App Router)
    (marketing)/page.tsx   "/" landing page
    (auth)/                login, register, forgot-password, reset-password (public, card layout)
    (onboarding)/          onboarding, select-organization (signed in, no active org)
    (app)/                 authenticated area: guarded AppShell layout (requireOrganization)
      dashboard|clients|jobs|quotes|finances|team|settings/page.tsx
      loading.tsx          LoadingState for the app area
      error.tsx            ErrorState with retry for the app area
    auth/callback/route.ts Supabase email/PKCE callback (Route Handler)
    auth/continue/route.ts Post-login routing for signed-in users (Route Handler)
    layout.tsx             Root layout: <html lang="sr-Latn">, Inter font, metadata
    not-found.tsx          404 page
    globals.css            Tailwind import + design tokens
  components/
    ui/                    shadcn/ui primitives (owned code, edit freely)
    auth/                  Auth forms (login, register, forgot/reset password), FormAlert
    onboarding/            OnboardingForm, OrganizationPicker
    layout/                AppShell, DesktopSidebar, MobileBottomNavigation, TopBar,
                           UserMenu (sign-out), OrganizationSwitcher, Logo
    shared/                PageHeader, EmptyState, LoadingState, ErrorState, ConfirmDialog
  config/
    navigation.ts          Route map + navigation items (single source of truth)
    site.ts                App name, description
    roles.ts               Serbian labels for member roles
  hooks/use-action-submit.ts  One-at-a-time server-action submit for forms
  instrumentation.ts       Server start: env report (names only), secret-leak guard
  proxy.ts                 Next.js 16 Proxy: session refresh, HTTP auth redirects, no-store
  lib/
    auth/                  Auth & tenancy: actions (server), session (DAL guards),
                           route-rules, redirects, active-organization, errors, messages
    organizations/actions.ts  Onboarding RPC call, organization switching
    env.ts                 Zod-validated public env + NEXT_PUBLIC_SITE_URL (lazy, browser-safe)
    env.server.ts          Zod-validated server secrets (server-only)
    env-shared.ts          Key classification + EnvValidationError (no values in messages)
    env-report.ts          Startup configuration report (server-only)
    supabase/client.ts     Browser client (publishable key, RLS)
    supabase/server.ts     Server client (publishable key + user cookies, RLS; server-only)
    supabase/admin.ts      Admin client (SECRET key, bypasses RLS; server-only)
    validations/           Reusable Zod fields + Serbian error messages
    utils.ts               cn() class helper
  types/                   Shared types (navigation; database.ts generated from the schema)
supabase/
  config.toml              Local stack config (auto_expose_new_tables = false)
  migrations/              Versioned SQL migrations (the only source of schema)
  tests/database/          pgTAP tests (*.test.sql) + shared _helpers.psql
  seed.sql                 Local development data (db reset only)
tests/
  setup.ts                 jest-dom matchers, cleanup
  unit/                    Vitest unit tests (*.test.ts[x])
  integration/             Vitest HTTP tests against the local Supabase stack
  e2e/                     Playwright specs (*.spec.ts)
docs/                      Product, architecture, database and security docs
```

## Routing

- Route groups separate layouts without affecting URLs:
  `(marketing)`, `(auth)`, `(onboarding)`, `(app)`. Auth routes and protection
  are described in [AUTHENTICATION.md](AUTHENTICATION.md).
- URL segments are English (`/jobs`, `/clients`) to match code; all visible
  labels are Serbian. Paths live in `routes` in `src/config/navigation.ts` —
  never hard-code them in components.
- Pages build as static shells (`○`); everything that reads the session
  streams in at request time behind `<Suspense>` (Cache Components), and the
  DAL calls `connection()` so auth is never prerendered or cached.

## App shell & responsive layout

- **Phone (< `md`, 768px):** sticky top bar (active organization / switcher +
  user menu with Settings and Sign out), content,
  fixed bottom navigation with 4 primary sections + "Više" menu
  (Finansije, Ekipa, Podešavanja). A page's `primaryAction` (via `PageHeader`)
  is pinned just above the bottom nav for thumb reach. `main` reserves bottom
  padding for both.
- **Desktop (≥ `md`):** fixed 240px left sidebar with all sections, top bar,
  content max-width 6xl; `primaryAction` renders inline in the header.
- Safe-area insets (`env(safe-area-inset-*)`) are respected; viewport uses
  `viewport-fit=cover`.
- Navigation items are defined once in `config/navigation.ts`
  (`appNavigation`, `mobilePrimaryNavigation`, `mobileOverflowNavigation`).

### Cache Components and `usePathname`

`cacheComponents` and `partialPrefetching` are on (Next 16 defaults from
`create-next-app`). Nav components read the URL with `usePathname()`, which
suspends on routes with dynamic params not covered by `generateStaticParams`.
`AppShell` wraps both navs in `<Suspense>` with a fallback that renders the same
nav without an active item, so future routes like `/jobs/[id]` will not break
prerendering. Keep this pattern for any client component that reads URL data.

## Styling & design tokens

Tokens are CSS variables in `globals.css`, exposed to Tailwind via
`@theme inline` (shadcn/ui convention):

- `primary` — dark navy; primary buttons, active nav, headings
- `highlight` — orange accent; the single most important CTA (`<Button variant="highlight">`)
- `accent` — intentionally neutral; shadcn/ui uses it for hover/focus backgrounds
- `background` (light cool grey), `card` (white), `muted`, `border`, `destructive`

Light theme only for now. No animation library is installed (shadcn's
`tw-animate-css` was deliberately omitted); `prefers-reduced-motion` is honored.
Touch targets: default buttons 40px, `lg` 48px, bottom nav items 64px tall.

## shadcn/ui

`components.json` is configured, so `npx shadcn@latest add <component>` works
where `ui.shadcn.com` is reachable. In the initial setup environment that host
was blocked, so the current primitives in `src/components/ui/` (button, card,
input, label, separator, skeleton, dropdown-menu, alert-dialog, form) were
added by hand following the shadcn new-york source, with these local changes:
`highlight` button variant, larger touch sizes, no enter/exit animations, and
`AlertDialogContent` as a bottom sheet on phones.

## Supabase and multi-tenancy

The full details are in [DATABASE.md](DATABASE.md) and [SECURITY.md](SECURITY.md).

- **Tenant = `organizations`.** A user can belong to many organizations through
  `memberships` (`owner` / `admin` / `manager` / `worker`; only `active` grants
  access). All future business tables carry `organization_id`.
- **Isolation lives in Postgres.** Grants, RLS policies, guard triggers and
  `SECURITY DEFINER` RPCs for multi-step writes enforce it. The Next.js app is
  not trusted for authorization.
- **Writes that create tenants or members go through RPCs:**
  `create_organization`, `create_organization_invitation`,
  `accept_organization_invitation`. Reads, updates and deletes use plain
  PostgREST queries filtered by RLS.
- **Three clients, three trust levels:**
  - `createSupabaseBrowserClient()` uses the publishable key in the browser.
  - `createSupabaseServerClient()` uses the publishable key plus the user's
    cookies, on the server.
  - `createSupabaseAdminClient()` uses the secret key on the server only and
    bypasses RLS.

  The first two act as the user. The admin client is reserved for trusted jobs
  and is guarded by `server-only` and ESLint.

- **Env validation (Zod):**
  - `getPublicEnv()` and `getServerEnv()` validate lazily, when a client is
    created, so pages without Supabase still render.
  - `src/instrumentation.ts` lists missing variables by name in development.
    It aborts startup if a secret key is placed in a `NEXT_PUBLIC_` variable.
- **Types:** `src/types/database.ts` is generated by `npm run db:types` from the
  local database. Never edit it by hand. Clients are typed with
  `Database`, so table, column and RPC names are checked at compile time.
- **Invitation tokens:** select explicit columns on `organization_invitations`.
  `select('*')` fails because `token_hash` is not readable.

## Authentication and active organization

See [AUTHENTICATION.md](AUTHENTICATION.md) for the full flows.

- **Proxy (`src/proxy.ts`):** refreshes the Supabase session cookies and
  returns HTTP 307s for signed-out users. It is optimistic only.
- **DAL (`src/lib/auth/session.ts`):** `getCurrentUser`, `requireUser`,
  `getActiveOrganization`, `requireOrganization` and `requireOrganizationRole`
  are the authoritative checks. They run per request (`connection()`) and are
  deduplicated with React `cache()`.
- **Mutations** are Server Actions (`src/lib/auth/actions.ts`,
  `src/lib/organizations/actions.ts`). They re-validate input with the shared
  Zod schema and return `ActionResult` (`{ ok, message?, fieldErrors? }`), or
  redirect.
- **Active organization:** an httpOnly cookie holds the preferred id. It is
  re-validated against the user's active memberships on every request.

## Forms & validation

Use React Hook Form with `zodResolver` and the shadcn `Form*` primitives from
`components/ui/form.tsx`. Submit to a Server Action through `useActionSubmit`
(loading state, double-submit guard, server field errors). The server action
validates again with the **same** schema (`src/lib/validations/{auth,onboarding}.ts`). Compose domain schemas from `lib/validations/common.ts`
(`requiredText`, `emailField`, `phoneField`); user-facing messages live in
`lib/validations/messages.ts` (Serbian).

## Testing

- **Unit (Vitest):** `tests/unit`. Render synchronous Server and Client
  Components with Testing Library. Mock `next/navigation` when needed.
  Async Server Components are not supported by Vitest — cover them with E2E.
- **Database (pgTAP):** `supabase/tests/database`. Each file runs in a
  transaction that is rolled back. `_helpers.psql` creates fixture users and
  organizations and switches roles the way PostgREST does
  (`tests.authenticate_as('owner_a')`).
- **Integration (Vitest, `--project integration`):** `tests/integration`. Real
  Auth and PostgREST requests against the local stack. The tests refuse to run
  against non-local URLs and clean up after themselves.
- **E2E (Playwright):** `tests/e2e`, run against a production build on port
  3100 in two projects: `desktop` (Desktop Chrome) and `mobile` (Pixel 7).

## Conventions

- Code, identifiers, comments and developer docs: English.
- User-facing text: Serbian, Latin script. Keep strings near their component
  for now; introduce an i18n layer only if a second language is needed.
- File names: kebab-case. Components: named exports (pages/layouts: default).
- Import alias `@/*` → `src/*`.
