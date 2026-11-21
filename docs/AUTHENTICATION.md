# Authentication & organizations

How users sign up, sign in, recover passwords, create their company and pick
the active organization. For the database side, see [DATABASE.md](DATABASE.md).
For the threat model and rules, see [SECURITY.md](SECURITY.md).

## Overview

```
/register ──signUp──▶ email (confirm) ──▶ /auth/callback ──▶ /onboarding ──RPC──▶ /dashboard
/login ─────signInWithPassword──────────────────────────────▶ /onboarding | /select-organization | /dashboard
/forgot-password ──resetPasswordForEmail──▶ email ──▶ /auth/callback ──▶ /reset-password ──▶ /dashboard
user menu "Odjava" ──signOut──▶ /login?signed_out=1
```

- **Supabase Auth** (email + password) through `@supabase/ssr`.
- The session lives in **cookies** that `@supabase/ssr` manages. Tokens are
  never stored in `localStorage` by app code.
- All auth calls run in **Server Actions** (`src/lib/auth/actions.ts`) or
  **Route Handlers** (`src/app/auth/*`). They use the server client, which
  combines the publishable key with the user's cookies.
- The admin client (secret key) is **not** used for any auth, onboarding or
  organization flow, so RLS applies everywhere.

## Routes

| Route                                                                           | Access                           | Purpose                                                   |
| ------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------- |
| `/`                                                                             | public                           | Marketing                                                 |
| `/login`                                                                        | public (signed-in → app)         | Sign in                                                   |
| `/register`                                                                     | public (signed-in → app)         | Create an account                                         |
| `/forgot-password`                                                              | public                           | Request a reset email                                     |
| `/reset-password`                                                               | public; needs a recovery session | Set a new password                                        |
| `/auth/callback`                                                                | public (Route Handler)           | Email confirmation, recovery, magic link, PKCE / OTP      |
| `/auth/continue`                                                                | Route Handler                    | Sends a signed-in user to onboarding, picker or dashboard |
| `/onboarding`                                                                   | signed in, no organization       | Company setup form                                        |
| `/select-organization`                                                          | signed in, several organizations | Choose the active organization                            |
| `/dashboard`, `/clients`, `/jobs`, `/quotes`, `/finances`, `/team`, `/settings` | signed in + active organization  | App                                                       |

## Route protection (two layers)

1. **`src/proxy.ts`**: Next.js 16 Proxy (the former `middleware.ts`) runs on
   every page request.
   - Refreshes the Supabase session with `getClaims()`, which validates the
     JWT and writes rotated cookies.
   - Signed out on a private route: a real **307** to
     `/login?next=<path>`. The path goes through `safeRedirectPath`.
   - Signed in on `/login` or `/register`: **307** to `/auth/continue`.
   - Private routes and `/auth/*` get `Cache-Control: private, no-store`, so the
     Back button can't show a cached private page after sign-out.
2. **Server guards** (`src/lib/auth/session.ts`) are the authoritative check.
   They run on every render, because the proxy is only an optimization.
   - `requireUser()` calls `supabase.auth.getUser()`, which is verified by
     Supabase Auth and not just decoded from the cookie.
   - `getActiveOrganization()` resolves the active organization (see below).
   - `requireOrganization()` redirects to `/onboarding` (no organization) or
     `/select-organization` (several, none chosen).
   - `requireOrganizationRole(roles)` does the same and also requires a role.
     Users without the role go to `/dashboard`.

   The `(app)` layout renders nothing until `requireOrganization()` succeeds.
   The `(onboarding)` pages call `getActiveOrganization()`, which requires a user.

   With Cache Components, the shell is sent before streamed content, so a
   redirect raised during render is applied in the browser. The proxy
   provides the HTTP-level redirect for signed-out users.

3. **The database (RLS)** protects the data even if both layers are bypassed.

Pure decision logic lives in `src/lib/auth/route-rules.ts`
(`decideProxyRoute`, `decidePostAuthDestination`) and is unit-tested.

**Redirect loops are avoided:**

- `/auth/continue` signs out a session that Supabase rejects (for example, a
  deleted user) before sending to `/login`.
- `/onboarding` sends users who have an organization to `/dashboard`, and app
  pages send users without one to `/onboarding`.
- `/reset-password` is never redirected away from, because it needs the
  recovery session.
- When Supabase Auth is down, `/auth/continue` never sends back to `/login`
  (see [Timeouts and outages](#timeouts-and-outages)).

## Safe redirects

`safeRedirectPath(value, fallback)` (`src/lib/auth/redirects.ts`) is used for
every `next` parameter: login, callback, continue, the organization picker and
the proxy.

It accepts only same-origin relative paths. It rejects:

- absolute and protocol-relative URLs (`https://…`, `//…`);
- backslash tricks (`/\evil`);
- other schemes (`javascript:`);
- control characters;
- `/auth/*` paths.

Anything else falls back to `/dashboard`.

## Registration

1. `RegisterForm` validates with `registerSchema` (`src/lib/validations/auth.ts`):
   - name is required;
   - email must be valid;
   - password is 10–72 characters (bcrypt limit);
   - the confirmation must match;
   - terms must be accepted.

   `signUpAction` validates again with the **same schema**.

2. `supabase.auth.signUp({ email, password, options })`:
   - `options.data.full_name` is copied into `profiles` by the existing
     `on_auth_user_created` trigger, which trims and clamps it;
   - `options.emailRedirectTo` is `${NEXT_PUBLIC_SITE_URL}/auth/callback?next=/onboarding`.
3. Email confirmation is **on**, so the user sees a "check your email" message.
   The message is identical whether the address was new or already
   registered, so it doesn't reveal which emails have accounts. If
   confirmation is off and a session is returned, the user goes straight to
   `/onboarding`.
4. No organization is created at sign-up.

Sign-in before confirming shows "E-mail adresa još nije potvrđena". This
appears only after a correct password, so it doesn't enable enumeration.

## Email confirmation and `/auth/callback`

- `?code=…` (PKCE, the default email links) uses `exchangeCodeForSession(code)`.
  The PKCE verifier cookie was set by `signUp` or `resetPasswordForEmail` in
  the same browser.
- `?token_hash=…&type=…` uses `verifyOtp`. This works across devices if the
  email templates are changed to link to
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email&next=/onboarding`.
- On success, the user is sent to `resolvePostAuthPath(next)`:
  - onboarding, picker or `next`;
  - recovery always goes to `/reset-password`.
- If Auth **answers** that the code or token is invalid, expired or already
  used (or the PKCE verifier is missing), the user goes to
  `/login?error=link_invalid` (or `/forgot-password?error=reset_link_invalid`).
  Pages render only **whitelisted** error keys (`publicErrorMessage`). Codes,
  tokens and upstream error text are never logged or shown.
- If Auth **doesn't answer** (timeout, deadline, network error or a 5xx from
  the gateway, i.e. `callAuth()` returns `unavailable`), the link may still be
  valid. The route answers **in place** with a 503 page
  (`src/lib/auth/callback-unavailable.ts`): "Prijava trenutno nije dostupna"
  and "Pokušaj ponovo". The button is `href=""`, so it repeats the same
  callback URL, and the code is never written into the page. The page sends
  `Cache-Control: private, no-store` and `Referrer-Policy: no-referrer`.
  auth-js deletes the PKCE verifier cookie after any failed exchange, so the
  route restores the cookie it received (only in this case). Otherwise the
  retry could only fail as "link invalid".

## Password reset

1. `/forgot-password` calls `resetPasswordForEmail` with `redirectTo`
   `/auth/callback?next=/reset-password`. The UI **always** shows: "Ako postoji
   nalog sa ovom adresom, poslali smo uputstvo za promenu lozinke." This
   holds even on errors or rate limits.
2. The email link opens `/auth/callback`, which exchanges the code and creates
   a recovery session. The user then lands on `/reset-password`.
3. `/reset-password` checks for a session on the server.
   - Without one, it shows "link not valid or expired" with a link to request
     a new one.
   - With one, `updatePasswordAction` validates with `resetPasswordSchema`
     (the same rules as registration) and calls `updateUser({ password })`.
     It then continues into the app (dashboard or onboarding).
4. The app stores no reset tokens. Supabase Auth handles them.

## CAPTCHA protection

The registration, sign-in and password-reset request forms support Cloudflare
Turnstile. Set the public `NEXT_PUBLIC_TURNSTILE_SITE_KEY` at build time and
configure the matching secret in hosted Supabase Auth → Attack Protection.
When the public key is absent (the default for the local stack), the widget is
not rendered and the existing local auth tests keep working.

The widget response is short-lived. The client sends it as `captchaToken` to
the matching Server Action, which validates the normal form first and then
forwards the token only to `signUp`, `signInWithPassword` or
`resetPasswordForEmail`. It is never logged, stored or included in a URL. A
configured form cannot be submitted until the challenge succeeds, and a
failed request resets the challenge before a retry. Supabase's
`captcha_failed` code maps to a fixed Serbian message without upstream detail.

Do not enable CAPTCHA in hosted Supabase until a production build containing
the site key and these three protected forms is live. Otherwise all three Auth
endpoints would reject requests without a token.

## Sign-out

`signOutAction` makes these calls:

- `supabase.auth.signOut({ scope: "local" })`, which revokes this device's
  refresh token and clears the auth cookies;
- it deletes the active-organization cookie;
- it redirects to `/login?signed_out=1`.

Business data is untouched. Private pages are `no-store`, and the server
guard requires a user, so Back or a reload can't show them again.

There is **no "Zapamti me"** option. `@supabase/ssr` keeps the session in
persistent cookies refreshed by the proxy. A session-only mode would need
custom cookie handling, which we chose not to add.

## Onboarding

`/onboarding` (`OnboardingForm`) collects:

- company name, business type, country, currency, time zone, phone and email;
- optionally PIB (9 digits), matični broj (8 digits), address, city and
  postal code.

The defaults are RS, RSD and Europe/Belgrade. The UI is Serbian (Latin).
The business type keys match `private.is_valid_business_type()`.

`createOrganizationAction` validates with `onboardingSchema` and calls the
RPC **`create_organization_with_details`**
(migration `20261121100000_onboarding_create_organization.sql`). It never uses
a direct insert.

- **Atomic:** the organization, the `owner` membership for `auth.uid()` and the
  idempotency record are written in one transaction. A failure leaves nothing
  behind, and no organization can exist without its owner.
- **No owner parameter:** the caller can't name someone else as owner.
- **Server-generated, unique slug:** the slug is built from the name with
  Serbian Latin transliteration (`đ→dj`, `č/ć→c`, …). The plain form is
  tried first, then a random 6-character suffix if it's taken. The unique
  constraint decides.
- **Idempotent:**
  - The form creates one `idempotencyKey` (UUID) per form instance and
    reuses it on retries.
  - The RPC takes a per-user advisory lock and returns the existing
    organization for a repeated key.
  - Together with the disabled button and an in-flight guard
    (`useActionSubmit`), a double click or a retry after a network error
    creates **one** organization.
- **Errors:** errors are mapped to a single retryable Serbian message. No
  database details are shown.
- **On success:** the new organization becomes the active one (cookie) and
  the user goes to `/dashboard`.

Why a new RPC? The existing `create_organization` takes a client-chosen slug,
no company details, and isn't idempotent. It stays in place, unchanged.

## Active organization

| Rule                                            | Implementation                                                                                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A cookie or URL id is only a preference         | `poslovodja_active_org` (httpOnly, SameSite=Lax, Secure in prod) holds an id, never a role or a name |
| Verified on every use                           | `listActiveMemberships()` reads the caller's memberships through RLS on each request                 |
| Unknown or foreign id is discarded              | `resolveActiveOrganization()` honors the cookie only if it matches an **active** membership          |
| One organization: chosen automatically          | `state: "selected"`                                                                                  |
| Several: picker                                 | `state: "needs-selection"` → `/select-organization`                                                  |
| Suspended or invited memberships give no access | filtered in SQL **and** in code                                                                      |
| Switching                                       | `switchOrganizationAction(id)` checks the id against active memberships before setting the cookie    |
| No trusted client state                         | the client receives names and ids for display only; the server re-resolves everything                |

**When memberships can't be read** (database or Data API error), this is
_not_ treated as "no organization".

- `listActiveMemberships()` returns `[]` only for a successful empty result.
  On a query error it throws `MembershipsUnavailableError`, which has the fixed
  digest `MEMBERSHIPS_UNAVAILABLE` and no upstream detail. It logs only
  `[auth] memberships_unavailable { code }`.
- Render guards (the `(app)` layout, `/onboarding`, `/select-organization`)
  let it reach the root error boundary `src/app/error.tsx`. The boundary shows
  "Trenutno ne možemo da učitamo podatke vaše firme. Pokušajte ponovo za
  nekoliko trenutaka." with **Pokušaj ponovo**, which calls `retry()` and
  re-runs the same request. The onboarding form is never shown in this
  state, so no organization can be created by mistake.
- Post-auth routing (login, `/auth/callback`, `/auth/continue`, password
  reset) uses the state `unavailable`. It keeps a safe `next` path, but never
  `/onboarding`, `/select-organization` or guest pages; the fallback is
  `/dashboard`. The guard there shows the retryable error.
- `switchOrganizationAction` returns the same safe message.
- Nothing redirects automatically to an error page, so there is no redirect
  loop.

Header: active organization name, a switcher (only with 2 or more
organizations), user initials and name, Settings and Sign out.

Use it in code:

```ts
import { requireOrganization, requireOrganizationRole } from "@/lib/auth/session";

const { user, organization } = await requireOrganization();
// organization.organizationId, organization.role ("owner" | "admin" | "manager" | "worker")

await requireOrganizationRole(["owner", "admin"]); // e.g. for settings mutations
```

Queries for business data must still filter by `organization.organizationId`.
RLS limits rows to the user's organizations, but it doesn't know which one is
active.

## Error messages

`src/lib/auth/errors.ts` maps Supabase error **codes** to Serbian messages
(`src/lib/auth/messages.ts`). Unknown errors become a generic message.
Raw `error.message` is never shown or logged.

## Timeouts and outages

Without a timeout, a stopped PostgREST or Auth container behind Kong made a
protected page hang for more than 30 s. All server-side Supabase clients
(`createSupabaseServerClient`, the proxy client, the admin client) now share
`serverClientRequestOptions()` from `src/lib/supabase/request-timeout.ts`:

| Setting (optional env)        | Default | Applies to                                                                                                                         |
| ----------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_REQUEST_TIMEOUT_MS` | 6 s     | Every HTTP request (`global.fetch` wrapper; also aborts a stalled body). A caller-provided `signal` is merged in.                  |
| `SUPABASE_AUTH_DEADLINE_MS`   | 7 s     | A whole `getUser()` / `getClaims()` call (`withAuthDeadline`). auth-js retries a failed token refresh with backoff for up to 30 s. |

Both are optional server-side env variables (see `.env.example`). Leave them
unset in normal use. They must be whole milliseconds between 1000 and 30000.
Any other value (empty, `abc`, `1e3`, `0`, over 30 s …) falls back to the
default and logs `[supabase] invalid_timeout_setting` with only the variable
name. Keep the Auth deadline above the request timeout.

The fetch wrapper removes its timer and its listener on the caller's signal
exactly once: when the body has been read, is cancelled or errors, when the
response has no body, when the fetch rejects, when the caller aborts, or
when the timeout fires. `withAuthDeadline` clears its timer as soon as the
call settles.

postgrest-js GET retries are turned off (`db.retry: false`) so they can't
multiply the timeout. The user retries from the error page instead.

What the user sees (always fail closed, never extra access):

| Situation                             | Result                                                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data API times out                    | `listActiveMemberships()` throws `MembershipsUnavailableError` → root error boundary, "Pokušaj ponovo". Profile and memberships load in parallel, so this takes one timeout, not two. |
| Auth times out in the proxy           | `getClaims()` failure = signed out. A private page redirects to `/login?next=…`, and `/login` is served (no redirect away from it, so no loop). Cookies are kept.                     |
| Auth times out in the DAL             | `getAuthUser()` returns `unavailable`, and guards throw `AuthUnavailableError` → root error boundary with "Trenutno ne možemo da proverimo vašu prijavu…".                            |
| Auth times out in `/auth/continue`    | The session is **not** signed out. The route redirects to the safe `next` or `/dashboard`, never to `/login`, which would loop through the proxy.                                     |
| Auth times out in `/auth/callback`    | 503 page in place, "Prijava trenutno nije dostupna" + "Pokušaj ponovo" (repeats the same link). PKCE verifier kept. Not "link nije važeći".                                           |
| Auth times out in "Nova lozinka"      | The action returns the same retryable message, not "link nije važeći".                                                                                                                |
| Other Auth actions (login, sign-up …) | The timeout is an `AuthRetryableFetchError` → the generic message.                                                                                                                    |

"Unavailable" means a timeout, network error or 5xx from the gateway
(`isAuthRetryableFetchError`). A real rejection (invalid or expired session)
is still "signed out". Logs carry only safe codes: `[supabase] request_timeout`
(with `service` and `timeoutMs`), `[supabase] auth_deadline_exceeded`,
`[auth] auth_unavailable` (HTTP status only), and `[auth] memberships_unavailable`
(`code: "request_failed"` for a timeout). They never include URLs, tokens,
cookies, keys or user data.

Manual check against the local stack:

```bash
docker stop supabase_rest_poslovodja   # PostgREST down: retryable error page within ~6 s
docker start supabase_rest_poslovodja
docker stop supabase_auth_poslovodja   # Auth down: /login or the retryable error within ~7 s
docker start supabase_auth_poslovodja
```

The browser client (`src/lib/supabase/client.ts`) deliberately has no
timeout. This is server-side work only, and these flows don't use it.

## Environment variables

| Variable                               | Used for                                     |
| -------------------------------------- | -------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | All Supabase clients, proxy                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | All Supabase clients, proxy                  |
| `NEXT_PUBLIC_SITE_URL`                 | Links in auth emails (never the Host header) |
| `NEXT_PUBLIC_BASE_PATH`                | Build-time app mount path                    |
| `SUPABASE_SECRET_KEY`                  | Admin client only (not used by these flows)  |
| `SUPABASE_REQUEST_TIMEOUT_MS`          | Optional, server only: request timeout (6 s) |
| `SUPABASE_AUTH_DEADLINE_MS`            | Optional, server only: Auth deadline (7 s)   |

Without Supabase configuration, public pages still render. Private pages
redirect to `/login`, which shows a "not available" message on submit. The
server logs the missing variable **names** at start in development.

## Supabase Auth settings

Local settings live in `supabase/config.toml`. Mirror them in the hosted
dashboard.

| Setting                             | Value                                                                              |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `site_url`                          | `http://localhost:3000` (production: full public app URL, including its base path) |
| `additional_redirect_urls`          | `…/auth/callback` for every origin the app runs on                                 |
| `minimum_password_length`           | `10` (= `PASSWORD_MIN_LENGTH`)                                                     |
| `[auth.email] enable_confirmations` | `true`                                                                             |

## Local testing

```bash
npm run db:start           # Supabase + Mailpit (emails: http://127.0.0.1:54324)
npm run db:reset           # migrations + seed
npm run dev                # with .env.local (see .env.example)
```

To test registration by hand, open http://localhost:3000/register. Read the
confirmation email in Mailpit at http://127.0.0.1:54324, then click the link.

Automated tests:

```bash
npm run test               # unit: schemas, redirects, route rules, actions, callback, forms
npm run db:test            # pgTAP incl. 07_onboarding.test.sql
npm run test:integration   # HTTP: concurrency/idempotency of onboarding, isolation
npm run test:e2e           # Playwright: smoke + app shell + auth flows
npm run test:e2e:auth      # only the full auth flows
```

The Playwright config reads the local stack from `supabase status`. It builds
the app with those `NEXT_PUBLIC_*` values on port 3100. Auth and app-shell
specs are **skipped** with a visible reason if Supabase isn't running.
