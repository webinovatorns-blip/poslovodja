-- Migration 4/5: privileges and row level security policies.
--
-- Two layers, both required:
--   1. GRANTs decide which operations/columns a role may attempt at all.
--   2. RLS policies decide which rows those operations apply to.
-- `anon` gets nothing. RLS was enabled when the tables were created.
-- Inserts into organizations, memberships and organization_invitations are
-- not granted to `authenticated`: they happen only through the RPCs in the
-- previous migration (create_organization, create_organization_invitation,
-- accept_organization_invitation).

-- ===========================================================================
-- profiles
-- ===========================================================================
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_url, locale) on public.profiles to authenticated;
grant all on public.profiles to service_role;

-- Supabase Auth inserts profiles through the on_auth_user_created trigger.
grant insert (id, full_name, phone, avatar_url) on public.profiles to supabase_auth_admin;

create policy profiles_select_own
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

create policy profiles_update_own
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_insert_by_auth_trigger
  on public.profiles for insert
  to supabase_auth_admin
  with check (true);

-- ===========================================================================
-- organizations
-- ===========================================================================
grant select, delete on public.organizations to authenticated;
grant update (
  name, slug, business_type, country_code, currency, timezone, phone, email,
  tax_id, registration_number, address, city, postal_code, logo_path
) on public.organizations to authenticated;
grant all on public.organizations to service_role;

create policy organizations_select_member
  on public.organizations for select
  to authenticated
  using ((select private.is_org_member(id)));

create policy organizations_update_owner_admin
  on public.organizations for update
  to authenticated
  using ((select private.has_org_role(id, array['owner', 'admin']::public.member_role[])))
  with check ((select private.has_org_role(id, array['owner', 'admin']::public.member_role[])));

create policy organizations_delete_owner
  on public.organizations for delete
  to authenticated
  using ((select private.is_org_owner(id)));

-- ===========================================================================
-- memberships
-- ===========================================================================
grant select, delete on public.memberships to authenticated;
grant update (role, status) on public.memberships to authenticated;
grant all on public.memberships to service_role;

-- Own memberships (any status) + all memberships of orgs where caller is active.
create policy memberships_select_own_or_org
  on public.memberships for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.is_org_member(organization_id))
  );

-- Owner/admin manage roles and status. Escalation and last-owner rules are
-- enforced by the memberships_guard_change trigger.
create policy memberships_update_owner_admin
  on public.memberships for update
  to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[])))
  with check ((select private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[])));

-- Owner/admin remove members; anyone can leave (trigger protects last owner
-- and prevents admins from removing owners).
create policy memberships_delete_owner_admin_or_self
  on public.memberships for delete
  to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
  );

-- ===========================================================================
-- organization_invitations
-- ===========================================================================
-- token_hash is deliberately excluded from the column grant.
grant select (id, organization_id, email, role, expires_at, accepted_at, invited_by, created_at)
  on public.organization_invitations to authenticated;
grant delete on public.organization_invitations to authenticated;
grant all on public.organization_invitations to service_role;

create policy organization_invitations_select_owner_admin
  on public.organization_invitations for select
  to authenticated
  using ((select private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[])));

-- Revoking: owner/admin, but only an owner may revoke an owner invitation.
create policy organization_invitations_delete_owner_admin
  on public.organization_invitations for delete
  to authenticated
  using (
    (select private.has_org_role(organization_id, array['owner', 'admin']::public.member_role[]))
    and (role <> 'owner' or (select private.is_org_owner(organization_id)))
  );
