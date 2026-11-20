-- Onboarding: create an organization with its details, atomically and idempotently.
--
-- Why a new RPC instead of changing public.create_organization:
--   * the existing RPC takes the slug from the client; onboarding must
--     generate a unique slug on the server;
--   * it only accepts name/slug/business_type; onboarding collects the full
--     company profile, which must be written in the same transaction;
--   * it is not idempotent: a double submit or a retry after a network error
--     would create two organizations.
-- The existing function, grants and RLS policies are left unchanged.

-- ---------------------------------------------------------------------------
-- Idempotency keys. Lives in `private`, so it's never exposed by the Data API.
-- ---------------------------------------------------------------------------
create table private.organization_creation_requests (
  user_id uuid not null references auth.users (id) on delete cascade,
  idempotency_key uuid not null,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, idempotency_key)
);

comment on table private.organization_creation_requests is
  'Maps (user, idempotency key) to the organization created by create_organization_with_details().';

alter table private.organization_creation_requests enable row level security;
revoke all on table private.organization_creation_requests from public, anon, authenticated;

create index organization_creation_requests_organization_id_idx
  on private.organization_creation_requests (organization_id);

-- ---------------------------------------------------------------------------
-- Slug helper: Serbian Latin aware ("Đorđe Šećerović" -> "djordje-secerovic").
-- ---------------------------------------------------------------------------
create function private.slugify(p_text text)
returns text
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  v text := lower(coalesce(p_text, ''));
begin
  v := replace(v, 'đ', 'dj');
  v := translate(v, 'čćšžàáâäãåèéêëìíîïòóôöõùúûüýÿñ', 'ccszaaaaaaeeeeiiiiooooouuuuyyn');
  v := regexp_replace(v, '[^a-z0-9]+', '-', 'g');
  v := btrim(v, '-');
  v := btrim(left(v, 40), '-');
  return v;
end;
$$;

revoke all on function private.slugify(text) from public;

-- Allowed onboarding business types (keys; the app owns the Serbian labels).
create function private.is_valid_business_type(p_value text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select p_value = any (array[
    'hvac_service', 'electrical', 'plumbing', 'renovation',
    'painting', 'tiling', 'carpentry', 'other'
  ]);
$$;

revoke all on function private.is_valid_business_type(text) from public;

-- ---------------------------------------------------------------------------
-- RPC
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: inserts into organizations/memberships, which
-- `authenticated` can't write directly. The owner is always auth.uid().
--
-- Idempotency: calls with the same (caller, p_idempotency_key) return the
-- organization created by the first call. A per-user advisory lock
-- serializes concurrent calls (double click, parallel retries), so they
-- can't both pass the "already created?" check.
create function public.create_organization_with_details(
  p_idempotency_key uuid,
  p_name text,
  p_business_type text,
  p_country_code text default 'RS',
  p_currency text default 'RSD',
  p_timezone text default 'Europe/Belgrade',
  p_phone text default null,
  p_email text default null,
  p_tax_id text default null,
  p_registration_number text default null,
  p_address text default null,
  p_city text default null,
  p_postal_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_country text := upper(btrim(coalesce(p_country_code, '')));
  v_currency text := upper(btrim(coalesce(p_currency, '')));
  v_timezone text := btrim(coalesce(p_timezone, ''));
  v_base_slug text;
  v_slug text;
  v_attempt integer := 0;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_idempotency_key is null then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_user) then
    raise exception 'profile_missing' using errcode = 'P0001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('create_organization:' || v_user::text, 0));

  select r.organization_id into v_org
  from private.organization_creation_requests r
  where r.user_id = v_user and r.idempotency_key = p_idempotency_key;

  if found then
    return v_org;
  end if;

  if char_length(v_name) not between 1 and 200 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  if not private.is_valid_business_type(p_business_type) then
    raise exception 'invalid_business_type' using errcode = '22023';
  end if;

  if v_country !~ '^[A-Z]{2}$' then
    raise exception 'invalid_country_code' using errcode = '22023';
  end if;

  if v_currency !~ '^[A-Z]{3}$' then
    raise exception 'invalid_currency' using errcode = '22023';
  end if;

  if not exists (select 1 from pg_catalog.pg_timezone_names t where t.name = v_timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;

  v_base_slug := private.slugify(v_name);
  if char_length(v_base_slug) < 3 then
    v_base_slug := btrim('firma-' || v_base_slug, '-');
  end if;
  v_slug := v_base_slug;

  -- Unique slug: the readable base first, then base + random suffix.
  -- The unique constraint is the source of truth (handles concurrent users).
  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.organizations (
        name, slug, business_type, country_code, currency, timezone, phone, email,
        tax_id, registration_number, address, city, postal_code
      ) values (
        v_name,
        v_slug,
        p_business_type,
        v_country,
        v_currency,
        v_timezone,
        nullif(btrim(p_phone), ''),
        lower(nullif(btrim(p_email), '')),
        nullif(btrim(p_tax_id), ''),
        nullif(btrim(p_registration_number), ''),
        nullif(btrim(p_address), ''),
        nullif(btrim(p_city), ''),
        nullif(btrim(p_postal_code), '')
      )
      returning id into v_org;
      exit;
    exception when unique_violation then
      if v_attempt >= 10 then
        raise exception 'slug_unavailable' using errcode = 'P0001';
      end if;
      v_slug := btrim(left(v_base_slug, 33), '-') || '-'
        || left(encode(extensions.gen_random_bytes(4), 'hex'), 6);
    end;
  end loop;

  insert into public.memberships (organization_id, user_id, role, status)
  values (v_org, v_user, 'owner', 'active');

  insert into private.organization_creation_requests (user_id, idempotency_key, organization_id)
  values (v_user, p_idempotency_key, v_org);

  return v_org;
end;
$$;

revoke all on function public.create_organization_with_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) from public, anon;
grant execute on function public.create_organization_with_details(
  uuid, text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
