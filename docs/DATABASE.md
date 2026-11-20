# Database

Supabase Postgres 17. The schema is defined only by versioned migrations in
`supabase/migrations/`. Never change the schema through the dashboard. Add a
new migration instead (`npx supabase migration new <name>`).

## Migrations (in order)

| #   | File                                                | Contents                                                                                                                                                                                                              |
| --- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `20261120100000_extensions_and_enums.sql`           | `pgcrypto`, `private` schema, enums `member_role` and `membership_status`                                                                                                                                             |
| 2   | `20261120100100_core_tables.sql`                    | `profiles`, `organizations`, `memberships`, `organization_invitations` with check constraints. RLS is **enabled** and all privileges are **revoked** from API roles here.                                             |
| 3   | `20261120100200_functions_and_triggers.sql`         | `updated_at` triggers, sign-up trigger, RLS helpers, membership guard trigger, and the RPCs `create_organization`, `create_organization_invitation`, `accept_organization_invitation` and `list_organization_members` |
| 4   | `20261120100300_rls_policies.sql`                   | Column-level grants and RLS policies                                                                                                                                                                                  |
| 5   | `20261120100400_indexes.sql`                        | Indexes for RLS lookups, foreign keys and pending invitations                                                                                                                                                         |
| 6   | `20261121100000_onboarding_create_organization.sql` | Onboarding RPC `create_organization_with_details` (atomic, idempotent, server-generated slug), `private.organization_creation_requests`, `private.slugify`, `private.is_valid_business_type`                          |

Tests and test data are **not** migrations. Migrations also run on hosted
projects, so test code there would reach production. They live in:

- `supabase/tests/database/*.test.sql`: pgTAP tests (`npm run db:test`)
- `supabase/seed.sql`: local development data, applied only by `supabase db reset`
- `tests/integration/*.test.ts`: HTTP tests against the local stack

## Entity relationships

```
auth.users 1 ──── 1 profiles
                     │ 1
                     │
                     │ *
organizations 1 ── * memberships   (unique: organization_id + user_id)
      │ 1
      │ *
organization_invitations ── invited_by ──> profiles (nullable)
```

| Reference                                                     | On delete | Why                                          |
| ------------------------------------------------------------- | --------- | -------------------------------------------- |
| `profiles.id → auth.users.id`                                 | cascade   | Profile is part of the user                  |
| `memberships.user_id → profiles.id`                           | cascade   | Deleting a user removes their memberships    |
| `memberships.organization_id → organizations.id`              | cascade   | Deleting an organization removes memberships |
| `organization_invitations.organization_id → organizations.id` | cascade   | Same as above                                |
| `organization_invitations.invited_by → profiles.id`           | set null  | Keeps the invitation, forgets the inviter    |

The cascade from user deletion is guarded. Deleting a user who is the
**last active owner** of an organization fails with `last_active_owner`.
Transfer ownership or delete the organization first. No organization is ever
left without an owner.

## Tables

### `profiles`

| Column       | Type        | Notes                                            |
| ------------ | ----------- | ------------------------------------------------ |
| `id`         | uuid PK     | = `auth.users.id`                                |
| `full_name`  | text        | ≤ 200 chars                                      |
| `phone`      | text        | ≤ 32 chars                                       |
| `avatar_url` | text        | ≤ 2048 chars (the trigger keeps https URLs only) |
| `locale`     | text        | default `sr-Latn`                                |
| `created_at` | timestamptz | default `now()`                                  |
| `updated_at` | timestamptz | maintained by trigger                            |

Created automatically by `on_auth_user_created` (see "Sign-up trigger").

### `organizations`

| Column                           | Type        | Notes                                                              |
| -------------------------------- | ----------- | ------------------------------------------------------------------ |
| `id`                             | uuid PK     | `gen_random_uuid()`                                                |
| `name`                           | text        | required, 1–200 chars                                              |
| `slug`                           | text        | **unique**, 3–63 chars, `[a-z0-9-]`, no leading or trailing hyphen |
| `business_type`                  | text        | ≤ 100 chars                                                        |
| `country_code`                   | text        | default `RS`, ISO-3166 alpha-2                                     |
| `currency`                       | text        | default `RSD`, ISO-4217                                            |
| `timezone`                       | text        | default `Europe/Belgrade`                                          |
| `phone`, `email`                 | text        | email format checked                                               |
| `tax_id`, `registration_number`  | text        | PIB / MB, ≤ 32 chars (format not enforced yet)                     |
| `address`, `city`, `postal_code` | text        | length limits                                                      |
| `logo_path`                      | text        | Storage object path (storage is not configured yet)                |
| `created_at`, `updated_at`       | timestamptz |                                                                    |

Organizations have no `UNIQUE (id, organization_id)` constraint because they
have no `organization_id` column.

### `memberships`

| Column                     | Type              | Notes            |
| -------------------------- | ----------------- | ---------------- |
| `id`                       | uuid PK           |                  |
| `organization_id`          | uuid FK           | immutable        |
| `user_id`                  | uuid FK           | immutable        |
| `role`                     | member_role       | default `worker` |
| `status`                   | membership_status | default `active` |
| `created_at`, `updated_at` | timestamptz       |                  |

`UNIQUE (organization_id, user_id)`: one membership per user per organization.

### `organization_invitations`

| Column            | Type        | Notes                                                              |
| ----------------- | ----------- | ------------------------------------------------------------------ |
| `id`              | uuid PK     |                                                                    |
| `organization_id` | uuid FK     |                                                                    |
| `email`           | text        | stored lowercased and trimmed                                      |
| `role`            | member_role | role granted on acceptance                                         |
| `token_hash`      | text        | **unique**, `hex(sha256(token))`. The plain token is never stored. |
| `expires_at`      | timestamptz | required, at most 30 days after `created_at`                       |
| `accepted_at`     | timestamptz | set once, on acceptance                                            |
| `invited_by`      | uuid FK     | nullable                                                           |
| `created_at`      | timestamptz |                                                                    |

A partial unique index allows at most **one pending invitation** per
organization and email.

### Composite tenant keys (for future tables)

No current table needs `UNIQUE (id, organization_id)`, because nothing
references `memberships` or invitations yet. When tenant tables arrive
(clients, jobs and so on), add the constraint to any table that **another
tenant table references**. The child then uses a composite foreign key, so a
row can never point at a row from a different organization:

```sql
alter table public.clients add constraint clients_id_organization_key unique (id, organization_id);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  foreign key (client_id, organization_id) references public.clients (id, organization_id)
);
```

## Enums

- `member_role`: `owner` > `admin` > `manager` > `worker`
- `membership_status`: `invited` (reserved for future use; invitations live in
  their own table), `active` (grants access), `suspended` (no access)

## Functions

| Function                                                                | Kind                                             | Called by                    |
| ----------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------- |
| `private.is_org_member(org)`                                            | definer, stable                                  | RLS policies                 |
| `private.has_org_role(org, roles[])`                                    | definer, stable                                  | RLS policies, RPCs           |
| `private.is_org_owner(org)`                                             | invoker, stable                                  | RLS policies, RPCs           |
| `private.role_rank(role)`                                               | invoker, immutable                               | guard trigger                |
| `private.handle_new_user()`                                             | invoker, trigger                                 | `auth.users` insert          |
| `private.guard_membership_change()`                                     | definer, trigger                                 | `memberships` update/delete  |
| `private.set_updated_at()`                                              | invoker, trigger                                 | updates                      |
| `public.create_organization(name, slug, business_type?)`                | definer RPC → uuid                               | signed-in users              |
| `public.create_organization_invitation(org, email, role?, expires_in?)` | definer RPC → (invitation_id, token, expires_at) | owner, admin                 |
| `public.accept_organization_invitation(token)`                          | definer RPC → uuid                               | signed-in invitee            |
| `public.list_organization_members(org)`                                 | definer RPC → rows                               | owner, admin                 |
| `public.create_organization_with_details(key, name, business_type, …)`  | definer RPC → uuid                               | signed-in users (onboarding) |
| `private.slugify(text)` / `private.is_valid_business_type(text)`        | invoker, immutable                               | onboarding RPC               |

`private` is not exposed by the Data API. The reasons for each `security definer`
are in [SECURITY.md](SECURITY.md).

### RPC errors

`error.message` is a stable key, and the app maps it to Serbian text:

| Key                                                 | SQLSTATE      | Meaning                                                |
| --------------------------------------------------- | ------------- | ------------------------------------------------------ |
| `not_authenticated`                                 | 42501         | No signed-in user                                      |
| `insufficient_role`                                 | 42501         | Caller lacks owner/admin role                          |
| `only_owner_can_invite_owner`                       | 42501         | Admin tried to invite (or replace) an owner            |
| `only_owner_can_manage_owners`                      | 42501         | Admin tried to grant, remove or change an owner        |
| `cannot_elevate_own_role`                           | 42501         | Self-promotion                                         |
| `cannot_change_own_status`                          | 42501         | Self-suspension or reactivation                        |
| `membership_immutable_fields`                       | 42501         | Changing organization_id or user_id                    |
| `last_active_owner`                                 | P0001         | Would leave the organization without an active owner   |
| `invitation_invalid`                                | P0001         | Unknown, malformed, expired, used or other-email token |
| `already_member`                                    | P0001         | Email or user already in the organization              |
| `profile_missing`                                   | P0001         | Caller has no profile row                              |
| `invalid_email` / `invalid_expiry` / `invalid_role` | 22023         | Bad argument                                           |
| (constraint)                                        | 23505 / 23514 | Duplicate slug or invalid field format                 |

## Processes

### Sign-up trigger

`auth.users` insert → `private.handle_new_user()` → `profiles` row:

- `full_name` comes from `full_name`, falling back to `name`. It is trimmed and
  clamped to 200 chars.
- `avatar_url` comes from `avatar_url` or `picture`, and is kept only if it is
  an https URL of at most 2048 chars.
- `phone` comes from `auth.users.phone` or metadata, dropped if longer than 32 chars.
- Non-object, NULL or oversized metadata never blocks sign-up.
- `ON CONFLICT DO NOTHING` means a profile is never duplicated.

### Creating an organization

```ts
const { data: organizationId, error } = await supabase.rpc("create_organization", {
  p_name: "Majstor Plus",
  p_slug: "majstor-plus",
  p_business_type: "Elektroinstalacije", // optional
});
```

One transaction creates the organization and an active `owner` membership for
`auth.uid()`. There is no owner argument. Direct `INSERT` into organizations
or memberships is not granted.

### Onboarding (create organization with details)

```ts
const { data: organizationId } = await supabase.rpc("create_organization_with_details", {
  p_idempotency_key: crypto.randomUUID(), // one per form; reuse on retry
  p_name: "Klima Servis Marko",
  p_business_type: "hvac_service", // hvac_service | electrical | plumbing | renovation | painting | tiling | carpentry | other
  p_country_code: "RS",
  p_currency: "RSD",
  p_timezone: "Europe/Belgrade",
  p_phone: "064 123 4567",
  p_email: "info@klima.rs", // + optional tax id, address, …
});
```

- The caller becomes the active `owner`. There is no owner argument.
- The slug comes from the name (Serbian Latin aware), plus a random suffix if
  the name is taken.
- The same `(caller, key)` always returns the same organization. A per-user
  advisory lock makes concurrent double submits safe. The mapping lives in
  `private.organization_creation_requests`, which the API doesn't expose.
- Errors: `invalid_idempotency_key`, `invalid_name`, `invalid_business_type`,
  `invalid_country_code`, `invalid_currency`, `invalid_timezone` (22023);
  `slug_unavailable` and `profile_missing` (P0001); `not_authenticated`
  (42501).
- It was added instead of changing `create_organization`, which still accepts
  a client slug, no details and no idempotency key, and is left untouched.

### Inviting a member

1. An owner or admin calls `create_organization_invitation(org, email, role, expires_in)`.
   Only an owner can invite with role `owner`. The lifetime is 1 hour to 30
   days (default 7). An existing pending invitation for the same email is
   replaced.
2. The RPC returns the plain `token` **once**. Deliver it as a link (email
   sending comes in a later phase). Only `sha256(token)` is stored.
3. The invitee signs in with the **same, confirmed** email and calls
   `accept_organization_invitation(token)`.
4. The RPC locks the invitation row and checks it is unused, unexpired and
   for the right email. It then inserts an active membership with the invited
   role and sets `accepted_at`, all in one transaction. A second call fails.
5. To revoke, an owner or admin runs `DELETE` on the invitation. Owner
   invitations can only be revoked by an owner.

### Managing members

- Change a role or suspend a member: `update memberships set role/status`
  (owner or admin).
- Remove a member: `delete from memberships` (owner or admin), or a user
  leaves (their own row).
- Transfer ownership: an owner promotes another member to `owner`, then steps
  down.
- List members with names: `rpc('list_organization_members', { p_organization_id })`.

## Commands

```bash
npm run db:start          # start the local stack (Docker)
npm run db:reset          # recreate the DB: all migrations + seed.sql
npm run db:test           # pgTAP tests (supabase test db)
npm run db:lint           # plpgsql_check lint of SQL functions
npm run db:types          # regenerate src/types/database.ts from the local DB
npm run test:integration  # HTTP tests against the local stack
npm run db:stop
```

New migration: `npx supabase migration new <name>`. Then run `npm run db:reset`,
`npm run db:test` and `npm run db:types`, and commit the SQL together with the
regenerated types.

Hosted project (later): `npx supabase link --project-ref <ref>`, then
`npx supabase db push`.
