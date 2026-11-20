@AGENTS.md

# CLAUDE.md — Poslovođa

Guidance for AI coding agents working in this repository. Read
`docs/ARCHITECTURE.md` and `docs/PRODUCT.md` before larger changes.

## Current phase

**Phase 3: authentication & organization onboarding** (done: sign-up,
confirmation, login, password reset, sign-out, onboarding RPC, active
organization). Do NOT build business modules (clients, jobs, quotes,
finances, team management) unless the user explicitly starts that phase.

## Auth rules

Read `docs/AUTHENTICATION.md` before touching auth, routing or sessions.

- Protect pages on the server: `requireUser` / `requireOrganization` /
  `requireOrganizationRole` from `src/lib/auth/session.ts` (never only in the client).
  New private route prefixes must be added to `src/lib/auth/route-rules.ts`.
- Any `next`/redirect target goes through `safeRedirectPath()`.
- The active organization id (cookie/URL) is a preference only; always use
  the server-resolved `organization` and filter business queries by its id.
- Show users only mapped messages (`src/lib/auth/messages.ts`); never raw
  Supabase/Postgres errors. Never log tokens, codes or keys.
- Test placeholders must be obviously fake (e.g. `PLACEHOLDER-TOKEN`), never
  key-shaped strings (GitHub secret scanning).

## Database & security rules

Read `docs/DATABASE.md` and `docs/SECURITY.md` before touching SQL or Supabase code.

- Schema changes only as new files in `supabase/migrations/` (never edit an
  applied migration). Then run `npm run db:reset && npm run db:test && npm run db:types`.
- Every new table: `organization_id`, `enable row level security`, explicit
  `revoke all ... from public, anon, authenticated`, minimal grants, policies
  via `private.is_org_member` / `private.has_org_role`, pgTAP tests for cross-tenant access.
- Functions: `set search_path = ''`, revoke EXECUTE from public/anon,
  `security definer` only with a documented reason (a test pins the list).
- Never weaken or skip an RLS policy, grant or test to make something pass.
- Secret key only via `src/lib/supabase/admin.ts` from server modules; never
  `NEXT_PUBLIC_*`. Prefer `createSupabaseServerClient()` (RLS applies).
- `src/types/database.ts` is generated; don't edit by hand or invent columns.

## Language rules

- **User-facing text: Serbian, Latin script** (latinica, with č ć đ š ž).
  Never Cyrillic, never English in the UI.
- **Code, identifiers, comments, commit messages, developer docs: English.**

## Next.js version

This is Next.js 16 with `cacheComponents` and `partialPrefetching` enabled.
APIs differ from older versions — check `node_modules/next/dist/docs/` before
using an unfamiliar API. Notable:

- `LayoutProps<"/route">` / `PageProps<"/route">` are global types (generated
  by `next typegen`, which `npm run typecheck` runs).
- `error.tsx` receives `{ error: unknown; retry: () => void }`.
- Client components using `usePathname`/`useSearchParams` must sit inside
  `<Suspense>` once dynamic routes exist (see `AppShell`).

## Where things go

- Routes: `src/app/(marketing|auth|app)/...`; URL segments in English.
- Route paths and nav items: `src/config/navigation.ts` (use `routes.*`, don't hard-code).
- shadcn/ui primitives: `src/components/ui/` (`npx shadcn@latest add <name>`).
- App frame: `src/components/layout/`. Reusable states/blocks: `src/components/shared/`.
- Zod schemas: `src/lib/validations/` (Serbian messages in `messages.ts`).
- Supabase clients: `src/lib/supabase/{client,server,admin}.ts`; env via
  `getPublicEnv()` / `getServerEnv()` (server-only).
- SQL: `supabase/migrations/`, pgTAP tests `supabase/tests/database/`, seed `supabase/seed.sql`.
- Auth/tenancy: `src/lib/auth/` (actions, session DAL, route rules), `src/proxy.ts`,
  `src/app/auth/{callback,continue}/route.ts`.
- Tests: `tests/unit/` (Vitest), `tests/integration/` (Vitest + local Supabase),
  `tests/e2e/*.spec.ts` (Playwright; auth specs need `npm run db:start`).

## Design rules

- Mobile first; check at 375–412px width before desktop.
- Main action of a screen → `PageHeader primaryAction` (pinned above bottom nav on phones).
- Colors via tokens only: `primary` (navy), `highlight` (orange CTA), `muted`,
  `destructive`. Do not use `accent` for brand color — it is the neutral hover token.
- Lucide icons; decorative icons get `aria-hidden="true"`.
- No animation libraries; keep transitions to `transition-colors`.
- Touch targets ≥ 40px (prefer `size="lg"` for primary mobile actions).

## Before finishing a task

```bash
npm run lint
npm run typecheck
npm run format:check
npm run test
npm run test:e2e   # when pages, layout or navigation change
npm run db:test            # when SQL changes (needs `npm run db:start`)
npm run test:integration   # when SQL or Supabase client code changes
```

All must pass. Never commit `.env.local` or real keys.
