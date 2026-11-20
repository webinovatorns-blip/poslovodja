# Security

Poslovođa is multi-tenant. Every organization's data must be isolated from
every other organization, **at the database level**, no matter which client
sends the request (the Next.js app, a browser console, `curl`, a mobile app).
The app UI is never a security boundary.

## Threat model in one paragraph

Anyone can obtain the publishable key and the URL; they ship in the browser
bundle. Any signed-in user can send arbitrary PostgREST requests with their
JWT. So every table must be safe for a hostile client that holds a valid
session. The only things that bypass RLS are the secret (`service_role`) key
and database roles like `postgres`. Those must stay on the server.

## Layers of defense

1. **Grants.** `anon` has nothing. `authenticated` has only the operations
   and columns it needs:

   | Table                      | SELECT                | INSERT | UPDATE (columns)                       | DELETE |
   | -------------------------- | --------------------- | ------ | -------------------------------------- | ------ |
   | `profiles`                 | ✓                     | –      | full_name, phone, avatar_url, locale   | –      |
   | `organizations`            | ✓                     | –      | business fields (not id or timestamps) | ✓      |
   | `memberships`              | ✓                     | –      | role, status                           | ✓      |
   | `organization_invitations` | all except token_hash | –      | –                                      | ✓      |

   Inserts happen only through RPCs. Every migration revokes privileges
   explicitly, so it does not depend on the project's "auto expose" default.
   `supabase/config.toml` also sets `auto_expose_new_tables = false`.

2. **Row Level Security.** It is enabled on every table in `public` (a test
   enforces this). Policies are listed below.
3. **Triggers for invariants** that a row-level policy can't express:
   role escalation and the last owner.
4. **RPCs** for multi-step operations that must be atomic and must not
   trust input: creating an organization, inviting, accepting.

## RLS policies

| Table                      | Operation | Allowed when                                                           |
| -------------------------- | --------- | ---------------------------------------------------------------------- |
| `profiles`                 | SELECT    | `id = auth.uid()`                                                      |
|                            | UPDATE    | `id = auth.uid()` (USING and WITH CHECK)                               |
|                            | INSERT    | only role `supabase_auth_admin` (sign-up trigger)                      |
| `organizations`            | SELECT    | caller is an **active** member                                         |
|                            | UPDATE    | caller is an active owner or admin (USING and WITH CHECK)              |
|                            | DELETE    | caller is an active owner                                              |
| `memberships`              | SELECT    | own rows (any status), or rows of organizations where caller is active |
|                            | UPDATE    | caller is an active owner or admin, plus the guard trigger             |
|                            | DELETE    | own row (leave), or caller is owner or admin, plus the guard trigger   |
| `organization_invitations` | SELECT    | caller is an active owner or admin                                     |
|                            | DELETE    | owner or admin; `owner`-role invitations need an owner                 |

Guard trigger (`private.guard_membership_change`), applied to user requests:

- no one can raise their own role or change their own status;
- only an owner can grant, remove or change the `owner` role or an owner's row;
- `organization_id` and `user_id` can't change.

For everyone, including `service_role` and cascades: the last **active**
owner can't be demoted, suspended, removed or deleted with their account.
The org row is locked during the check, so concurrent demotions can't both
pass. The only exception is deleting the organization itself.

A **suspended** member loses access to organization data immediately (all
helpers require `status = 'active'`). They can still see their own
membership row.

## Profile visibility

The `profiles` RLS allows only your own row. Owners and admins see **basic**
fields of members (name and avatar, no phone) only through
`list_organization_members(org)`, which checks the role and returns only that
organization's members.

## Function hardening

- Every function sets `search_path = ''` and uses schema-qualified names.
- `EXECUTE` is revoked from `PUBLIC` and `anon` on every function (a test
  enforces this). Helpers are granted to `authenticated` and `service_role`.
  RPCs are granted to `authenticated` only.
- Helpers and trigger functions live in the `private` schema, which the Data
  API does not expose.
- `SECURITY DEFINER` is used only where needed. A test pins this exact list:

| Function                         | Why definer                                                                                                                                                                       |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_org_member`, `has_org_role`  | Called from `memberships` policies; an invoker version would recurse. They only answer about **the caller's own** membership, so they can't be used to probe other organizations. |
| `guard_membership_change`        | Must count all owners regardless of the caller's visibility, including during cascades.                                                                                           |
| `create_organization`            | Inserts into tables that `authenticated` can't write directly. The owner is always `auth.uid()`.                                                                                  |
| `create_organization_invitation` | Same, plus reads `auth.users` to reject existing members.                                                                                                                         |
| `accept_organization_invitation` | Same, plus reads the caller's confirmed email from `auth.users`.                                                                                                                  |
| `list_organization_members`      | Profiles RLS is own-row only. It returns basic fields after a role check.                                                                                                         |

- `handle_new_user` runs as an **invoker** (`supabase_auth_admin`). That role
  was granted only `INSERT (id, full_name, phone, avatar_url)` on `profiles`
  and a matching insert policy. It gets no SELECT, UPDATE or DELETE and no
  other tables.

## Invitations

- Each token is 256 bits from `gen_random_bytes(32)`, hex-encoded.
- Only `sha256(token)` is stored, and API roles can't read the `token_hash`
  column.
- Every invitation expires (at most 30 days, enforced by a CHECK constraint and
  the RPC).
- Acceptance happens under a row lock in a single transaction, so an
  invitation can be used once.
- The invitee's **confirmed** account email must match the invitation, so a
  leaked link is useless to other accounts.
- Every failure returns the same `invitation_invalid` error. This does not
  reveal whether a token exists, expired or was used.

## Keys and clients

| Module                       | Key                        | RLS      | Where it can run                                    |
| ---------------------------- | -------------------------- | -------- | --------------------------------------------------- |
| `src/lib/supabase/client.ts` | publishable                | applies  | browser (Client Components)                         |
| `src/lib/supabase/server.ts` | publishable + user cookies | applies  | Server Components, Server Functions, Route Handlers |
| `src/lib/supabase/admin.ts`  | **secret**                 | bypassed | dedicated server modules only                       |

Guards against leaking the secret key:

- `admin.ts` and `env.server.ts` import `server-only`, so a client-bundle
  import fails the build (a unit test verifies the guard).
- ESLint `no-restricted-imports` blocks both modules in `src/app/**` and
  `src/components/**`.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is rejected if it holds a secret or
  `service_role` key.
- At startup (`src/instrumentation.ts`), the server **refuses to start** if
  any `NEXT_PUBLIC_*` variable contains a secret key.
- Configuration errors list variable **names** only, never values.

## Authentication and sessions

Full flows are in [AUTHENTICATION.md](AUTHENTICATION.md).

- **Sessions:** `@supabase/ssr` keeps sessions in cookies. App code never
  stores tokens in `localStorage`. The proxy refreshes tokens with
  `getClaims()`. Server guards use `getUser()`, which is validated by
  Supabase Auth.
- **Defense in depth for routes:** the proxy (HTTP 307) runs first, then the
  server guards on every render, then RLS. No protection relies on a
  client-side `useEffect`.
- **No open redirects:** every `next` value goes through
  `safeRedirectPath()`, which accepts internal paths only and never
  `/auth/*`. Email links are built from `NEXT_PUBLIC_SITE_URL`, never from the
  request `Host` header.
- **No account enumeration:**
  - registration shows the same message for new and existing emails;
  - forgot-password always shows the same neutral message;
  - login says only "Pogrešan e-mail ili lozinka.";
  - "email not confirmed" appears only after a correct password.
- **No leaking errors:**
  - Supabase and Postgres errors are mapped by **code** to fixed Serbian
    messages;
  - the callback redirects with whitelisted error keys only;
  - auth codes, tokens and raw messages are never logged or rendered.
- **Active organization:**
  - The cookie (`poslovodja_active_org`; httpOnly, SameSite=Lax, Secure in
    production) is only a **preference**.
  - Each request re-checks it against the user's **active** memberships,
    loaded through RLS.
  - A foreign, suspended or malformed id is ignored. Roles and names never
    come from the client.
- **Onboarding:** the controlled RPC `create_organization_with_details` is
  atomic and idempotent, makes the caller the owner and generates the slug on
  the server. The idempotency table lives in the unexposed `private` schema.
  No direct inserts are possible: grants deny them.
- **Sign-out:**
  - `signOut({ scope: "local" })` runs and the organization cookie is
    cleared;
  - private routes send `Cache-Control: private, no-store`, so Back doesn't
    show cached private pages.
- **CSRF:** Server Actions are POST-only and Next.js checks `Origin` against
  `Host`. The session cookie is `SameSite=Lax`.
- **Admin client:** no auth, onboarding or organization flow uses the secret
  key.

## Verifying

- `npm run db:test` runs about 145 pgTAP assertions, including the 12 tenant
  scenarios (look for `[1]` to `[12]` in test names) and the onboarding RPC
  (`07_onboarding.test.sql`).
- Unit tests (`tests/unit/auth-*.test.ts`, `route-rules`, `active-organization`)
  cover the auth scenarios `[1]` to `[19]`. Playwright (`tests/e2e/auth-flow.spec.ts`)
  covers the full flow against the local stack.
- `npm run test:integration` sends raw HTTP and supabase-js requests to
  Auth and PostgREST, bypassing the app.
- The tests catch weakened rules. Replacing the organizations SELECT policy
  with `using (true)` and dropping the guard trigger made 17 assertions fail
  (checked once during development).

## Rules for new tables

1. Add `organization_id uuid not null references organizations on delete cascade`.
2. `enable row level security` and `revoke all ... from public, anon, authenticated` in the same migration.
3. Grant only the needed operations and columns. Write policies with
   `private.is_org_member` / `private.has_org_role`, wrapped in `(select ...)`.
4. Use composite foreign keys `(x_id, organization_id)` for cross-table
   references (see DATABASE.md).
5. Index `organization_id`.
6. Add pgTAP tests: cross-tenant read and write must fail.

## Open decisions and known risks

- **Member profile visibility:** owners **and admins** can list members'
  basic profiles, because admins manage members. Managers and workers can't
  see coworkers' names yet. Decide when building the team and job-assignment
  features.
- **Organization deletion** is a plain `DELETE` allowed to owners and
  cascades to all data. Consider soft delete or a confirmation RPC before
  business data exists.
- **No limit on organizations per user** and no rate limiting on RPCs. Add
  one before public launch.
- **Last owner blocks account deletion.** This is intentional (no orphaned
  organizations), but account deletion UX must offer "transfer ownership" or
  "delete organization" first.
- **Auth settings:** local config now requires email confirmation and
  10-character passwords. **The hosted project must be configured the same
  way** (dashboard → Authentication). It also needs SMTP, rate limits and
  CAPTCHA before public launch.
- **Same-device PKCE links:** the default confirmation and reset emails only
  work in the browser that started the flow. For cross-device links, switch
  the email templates to the `token_hash` form (supported by `/auth/callback`).
- **No "Zapamti me":** sessions persist until sign-out or refresh-token
  expiry. A shared-device mode would need custom cookie handling.
- **Signed-in JWTs stay valid until they expire** (`jwt_expiry` = 1 h) after a
  sign-out on _another_ device, because `getClaims()` verifies locally. The
  server guards call `getUser()`, which checks with Supabase Auth.
- **`membership_status = 'invited'`** is unused, reserved for a future flow.
- **PIB and matični broj:** the app checks the digit count (9 and 8); the
  database stores them as free text (no checksum validation yet).
