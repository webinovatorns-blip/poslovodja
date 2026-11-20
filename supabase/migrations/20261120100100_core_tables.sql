-- Migration 2/5: core tables.
--
-- Secure by default: every table gets RLS enabled and all privileges revoked
-- from the API roles here. Grants and policies are added in the RLS
-- migration. Explicit revokes keep this safe regardless of the project's
-- default privileges ("auto expose new tables").

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user, created by trigger.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  locale text not null default 'sr-Latn',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 200),
  constraint profiles_phone_length check (phone is null or char_length(phone) <= 32),
  constraint profiles_avatar_url_length check (avatar_url is null or char_length(avatar_url) <= 2048),
  constraint profiles_locale_format check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$')
);

comment on table public.profiles is 'Public profile of an auth user. Created automatically on sign-up.';

-- ---------------------------------------------------------------------------
-- organizations: the tenant. Created only through public.create_organization().
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  business_type text,
  country_code text not null default 'RS',
  currency text not null default 'RSD',
  timezone text not null default 'Europe/Belgrade',
  phone text,
  email text,
  tax_id text,
  registration_number text,
  address text,
  city text,
  postal_code text,
  logo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint organizations_slug_key unique (slug),
  constraint organizations_name_length check (char_length(btrim(name)) between 1 and 200),
  -- 3-63 chars, lowercase letters, digits and inner hyphens.
  constraint organizations_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'),
  constraint organizations_business_type_length check (business_type is null or char_length(business_type) <= 100),
  constraint organizations_country_code_format check (country_code ~ '^[A-Z]{2}$'),
  constraint organizations_currency_format check (currency ~ '^[A-Z]{3}$'),
  constraint organizations_timezone_length check (char_length(timezone) between 1 and 64),
  constraint organizations_phone_length check (phone is null or char_length(phone) <= 32),
  constraint organizations_email_format check (
    email is null or (char_length(email) <= 320 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')
  ),
  constraint organizations_tax_id_length check (tax_id is null or char_length(tax_id) <= 32),
  constraint organizations_registration_number_length check (
    registration_number is null or char_length(registration_number) <= 32
  ),
  constraint organizations_address_length check (address is null or char_length(address) <= 300),
  constraint organizations_city_length check (city is null or char_length(city) <= 100),
  constraint organizations_postal_code_length check (postal_code is null or char_length(postal_code) <= 16),
  constraint organizations_logo_path_length check (logo_path is null or char_length(logo_path) <= 1024)
);

comment on table public.organizations is 'Tenant. All business data will be scoped by organization_id.';

-- ---------------------------------------------------------------------------
-- memberships: user <-> organization with a role.
-- ---------------------------------------------------------------------------
create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'worker',
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint memberships_organization_user_key unique (organization_id, user_id)
);

comment on table public.memberships is
  'Membership of a user in an organization. Only active memberships grant access.';

-- ---------------------------------------------------------------------------
-- organization_invitations: only the SHA-256 hash of the token is stored.
-- ---------------------------------------------------------------------------
create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  email text not null,
  role public.member_role not null default 'worker',
  token_hash text not null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),

  constraint organization_invitations_token_hash_key unique (token_hash),
  constraint organization_invitations_email_format check (
    email = lower(btrim(email))
    and char_length(email) <= 320
    and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  ),
  constraint organization_invitations_token_hash_format check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint organization_invitations_expiry_window check (
    expires_at > created_at and expires_at <= created_at + interval '30 days'
  ),
  constraint organization_invitations_accepted_after_created check (
    accepted_at is null or accepted_at >= created_at
  )
);

comment on table public.organization_invitations is
  'Pending/accepted invitations. token_hash = hex(sha256(token)); the plain token is never stored.';
comment on column public.organization_invitations.token_hash is
  'hex-encoded SHA-256 of the invitation token. Not readable by API roles.';

-- ---------------------------------------------------------------------------
-- Secure defaults.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.organization_invitations enable row level security;

revoke all on table
  public.profiles,
  public.organizations,
  public.memberships,
  public.organization_invitations
from public, anon, authenticated;
