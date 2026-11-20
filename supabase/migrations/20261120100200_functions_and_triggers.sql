-- Migration 3/5: functions and triggers.
--
-- Conventions for every function here:
--   * `set search_path = ''` and fully qualified names (no search_path hijacking).
--   * EXECUTE revoked from PUBLIC (Postgres grants it by default) and granted
--     only to the roles that need it.
--   * SECURITY DEFINER only where documented below; definer functions are
--     owned by `postgres` (BYPASSRLS) and only expose information about the
--     calling user (auth.uid()).
--
-- Error contract for RPCs: `message` is a stable machine-readable key
-- (e.g. 'invitation_invalid'); SQLSTATE 42501 = not allowed, 22023 = invalid
-- argument, P0001 = business rule violation. The app maps keys to Serbian text.

-- ===========================================================================
-- Generic: updated_at
-- ===========================================================================
create function private.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function private.set_updated_at();

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function private.set_updated_at();

-- ===========================================================================
-- Profile creation on sign-up
-- ===========================================================================
-- SECURITY INVOKER on purpose: it runs as `supabase_auth_admin` (the role
-- Supabase Auth uses to insert into auth.users). That role receives only
-- INSERT on four profile columns plus a matching RLS policy (see RLS
-- migration) - nothing else in `public`.
--
-- Metadata is untrusted user input (sign-up options.data): values are
-- type-checked, trimmed and clamped so they can never violate a profile
-- constraint and block sign-up.
create function private.handle_new_user()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  meta jsonb := case
    when jsonb_typeof(new.raw_user_meta_data) = 'object' then new.raw_user_meta_data
    else '{}'::jsonb
  end;
  v_full_name text;
  v_avatar_url text;
  v_phone text;
begin
  v_full_name := left(
    nullif(btrim(coalesce(meta ->> 'full_name', meta ->> 'name', '')), ''),
    200
  );

  v_avatar_url := nullif(btrim(coalesce(meta ->> 'avatar_url', meta ->> 'picture', '')), '');
  if v_avatar_url is not null
    and (char_length(v_avatar_url) > 2048 or v_avatar_url !~* '^https://') then
    v_avatar_url := null;
  end if;

  v_phone := nullif(btrim(coalesce(new.phone, meta ->> 'phone', '')), '');
  if v_phone is not null and char_length(v_phone) > 32 then
    v_phone := null;
  end if;

  insert into public.profiles (id, full_name, phone, avatar_url)
  values (new.id, v_full_name, v_phone, v_avatar_url)
  -- No conflict target on purpose: a target would require SELECT on
  -- profiles.id for supabase_auth_admin. The primary key is the only unique
  -- constraint on profiles, so this only skips duplicate profiles.
  on conflict do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

grant usage on schema private to supabase_auth_admin;
grant execute on function private.handle_new_user() to supabase_auth_admin;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ===========================================================================
-- RLS helper functions
-- ===========================================================================
-- SECURITY DEFINER is justified: policies on `memberships` call these, and an
-- invoker function would recurse into the same policies. Each function only
-- answers a yes/no question about the CALLER's own membership, so it cannot
-- be used to enumerate other users or organizations.

create function private.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
  );
$$;

create function private.has_org_role(target_org uuid, allowed_roles public.member_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.organization_id = target_org
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = any (allowed_roles)
  );
$$;

-- Invoker: delegates to has_org_role, needs no extra rights.
create function private.is_org_owner(target_org uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.has_org_role(target_org, array['owner']::public.member_role[]);
$$;

create function private.role_rank(r public.member_role)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case r
    when 'owner' then 4
    when 'admin' then 3
    when 'manager' then 2
    when 'worker' then 1
  end;
$$;

revoke all on function private.is_org_member(uuid) from public;
revoke all on function private.has_org_role(uuid, public.member_role[]) from public;
revoke all on function private.is_org_owner(uuid) from public;
revoke all on function private.role_rank(public.member_role) from public;

grant execute on function private.is_org_member(uuid) to authenticated, service_role;
grant execute on function private.has_org_role(uuid, public.member_role[]) to authenticated, service_role;
grant execute on function private.is_org_owner(uuid) to authenticated, service_role;
grant execute on function private.role_rank(public.member_role) to authenticated, service_role;

-- ===========================================================================
-- Membership guard (role escalation + last owner)
-- ===========================================================================
-- SECURITY DEFINER is justified: the last-owner check must count ALL owners
-- of the organization, independent of the caller's RLS visibility, and must
-- also run during cascades (user deletion) that execute as other roles.
--
-- Rules for requests made by a signed-in user (auth.uid() is not null):
--   * nobody can raise their own role or change their own status;
--   * only an owner can grant/revoke the owner role or touch an owner row;
-- Rules for everyone (including service_role and cascades):
--   * organization_id and user_id are immutable;
--   * the last active owner can't be demoted, suspended or removed,
--     unless the whole organization is being deleted.
create function private.guard_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  loses_active_owner boolean;
begin
  if tg_op = 'DELETE' then
    -- Cascade from organization deletion: the parent row is already gone.
    if not exists (select 1 from public.organizations o where o.id = old.organization_id) then
      return old;
    end if;

    if actor is not null and old.role = 'owner' and old.user_id <> actor
      and not private.is_org_owner(old.organization_id) then
      raise exception 'only_owner_can_manage_owners' using errcode = '42501';
    end if;

    loses_active_owner := old.role = 'owner' and old.status = 'active';
  else
    if new.organization_id <> old.organization_id or new.user_id <> old.user_id then
      raise exception 'membership_immutable_fields' using errcode = '42501';
    end if;

    if actor is not null then
      if new.user_id = actor then
        if new.status <> old.status then
          raise exception 'cannot_change_own_status' using errcode = '42501';
        end if;
        if private.role_rank(new.role) > private.role_rank(old.role) then
          raise exception 'cannot_elevate_own_role' using errcode = '42501';
        end if;
      end if;

      if (old.role = 'owner' or new.role = 'owner')
        and (new.role <> old.role or new.status <> old.status)
        and not private.is_org_owner(old.organization_id) then
        raise exception 'only_owner_can_manage_owners' using errcode = '42501';
      end if;
    end if;

    loses_active_owner := old.role = 'owner' and old.status = 'active'
      and (new.role <> 'owner' or new.status <> 'active');
  end if;

  if loses_active_owner then
    -- Serialize owner changes per organization so two concurrent demotions
    -- can't both pass the check below.
    perform 1 from public.organizations o where o.id = old.organization_id for update;

    if not exists (
      select 1
      from public.memberships m
      where m.organization_id = old.organization_id
        and m.id <> old.id
        and m.role = 'owner'
        and m.status = 'active'
    ) then
      raise exception 'last_active_owner'
        using errcode = 'P0001',
              hint = 'Transfer ownership to another active member or delete the organization first.';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.guard_membership_change() from public;

create trigger memberships_guard_change
  before update or delete on public.memberships
  for each row execute function private.guard_membership_change();

-- ===========================================================================
-- RPC: create_organization
-- ===========================================================================
-- The only way for a user to create an organization. Atomic (single
-- function call = single transaction): creates the organization and an
-- active `owner` membership for the CALLER. There is no owner parameter,
-- so a caller cannot make someone else the owner.
create function public.create_organization(
  p_name text,
  p_slug text,
  p_business_type text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_org uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_user) then
    raise exception 'profile_missing' using errcode = 'P0001';
  end if;

  insert into public.organizations (name, slug, business_type)
  values (btrim(p_name), lower(btrim(p_slug)), nullif(btrim(p_business_type), ''))
  returning id into v_org;

  insert into public.memberships (organization_id, user_id, role, status)
  values (v_org, v_user, 'owner', 'active');

  return v_org;
end;
$$;

revoke all on function public.create_organization(text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text) to authenticated;

-- ===========================================================================
-- RPC: create_organization_invitation
-- ===========================================================================
-- Generates a random 256-bit token, stores only its SHA-256 hash and returns
-- the plain token ONCE to the caller (to be delivered by email/link).
-- Owner/admin only; only an owner may invite another owner.
-- An existing pending invitation for the same email is replaced.
create function public.create_organization_invitation(
  p_organization_id uuid,
  p_email text,
  p_role public.member_role default 'worker',
  p_expires_in interval default interval '7 days'
)
returns table (invitation_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_email text := lower(btrim(p_email));
  v_token text;
  v_id uuid;
  v_expires timestamptz;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if not private.has_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  if p_role is null then
    raise exception 'invalid_role' using errcode = '22023';
  end if;

  if p_role = 'owner' and not private.is_org_owner(p_organization_id) then
    raise exception 'only_owner_can_invite_owner' using errcode = '42501';
  end if;

  if p_expires_in is null
    or p_expires_in < interval '1 hour'
    or p_expires_in > interval '30 days' then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;

  if v_email is null
    or char_length(v_email) > 320
    or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = p_organization_id
      and lower(u.email) = v_email
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  -- An admin must not be able to cancel a pending owner invitation by re-inviting.
  if exists (
    select 1
    from public.organization_invitations i
    where i.organization_id = p_organization_id
      and i.email = v_email
      and i.accepted_at is null
      and i.role = 'owner'
  ) and not private.is_org_owner(p_organization_id) then
    raise exception 'only_owner_can_invite_owner' using errcode = '42501';
  end if;

  delete from public.organization_invitations i
  where i.organization_id = p_organization_id
    and i.email = v_email
    and i.accepted_at is null;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires := now() + p_expires_in;

  insert into public.organization_invitations
    (organization_id, email, role, token_hash, expires_at, invited_by)
  values (
    p_organization_id,
    v_email,
    p_role,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_expires,
    v_user
  )
  returning id into v_id;

  return query select v_id, v_token, v_expires;
end;
$$;

revoke all on function public.create_organization_invitation(uuid, text, public.member_role, interval)
  from public, anon;
grant execute on function public.create_organization_invitation(uuid, text, public.member_role, interval)
  to authenticated;

-- ===========================================================================
-- RPC: accept_organization_invitation
-- ===========================================================================
-- Single-use and atomic: the invitation row is locked (FOR UPDATE), checked,
-- the membership is created and accepted_at is set in one transaction.
-- The caller's confirmed email must match the invitation email, so a leaked
-- link can't be redeemed by another account.
-- Every failure returns the same 'invitation_invalid' error to avoid leaking
-- whether a token exists, expired or was used.
create function public.accept_organization_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_user uuid := auth.uid();
  v_email text;
  v_invitation public.organization_invitations%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;

  select lower(u.email) into v_email
  from auth.users u
  where u.id = v_user
    and u.email_confirmed_at is not null;

  select i.* into v_invitation
  from public.organization_invitations i
  where i.token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
  for update;

  if not found
    or v_invitation.accepted_at is not null
    or v_invitation.expires_at <= now()
    or v_email is null
    or v_invitation.email <> v_email then
    raise exception 'invitation_invalid' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.memberships m
    where m.organization_id = v_invitation.organization_id
      and m.user_id = v_user
  ) then
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  insert into public.memberships (organization_id, user_id, role, status)
  values (v_invitation.organization_id, v_user, v_invitation.role, 'active');

  update public.organization_invitations i
  set accepted_at = now()
  where i.id = v_invitation.id;

  return v_invitation.organization_id;
end;
$$;

revoke all on function public.accept_organization_invitation(text) from public, anon;
grant execute on function public.accept_organization_invitation(text) to authenticated;

-- ===========================================================================
-- RPC: list_organization_members
-- ===========================================================================
-- Profiles RLS only allows reading your own profile. Owners and admins (who
-- manage members) can read BASIC profile fields of their organization's
-- members through this function - no phone, no other organizations.
create function public.list_organization_members(p_organization_id uuid)
returns table (
  membership_id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  role public.member_role,
  status public.membership_status,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.has_org_role(p_organization_id, array['owner', 'admin']::public.member_role[]) then
    raise exception 'insufficient_role' using errcode = '42501';
  end if;

  return query
  select m.id, m.user_id, p.full_name, p.avatar_url, m.role, m.status, m.created_at
  from public.memberships m
  join public.profiles p on p.id = m.user_id
  where m.organization_id = p_organization_id
  order by m.created_at;
end;
$$;

revoke all on function public.list_organization_members(uuid) from public, anon;
grant execute on function public.list_organization_members(uuid) to authenticated;
