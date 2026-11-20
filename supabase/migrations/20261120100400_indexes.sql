-- Migration 5/5: indexes.
--
-- Already indexed through constraints:
--   profiles(id), organizations(id), organizations(slug),
--   memberships(organization_id, user_id)  -- serves RLS helper lookups
--   organization_invitations(token_hash)

-- "Which organizations does this user belong to?" + FK cascade from profiles.
create index memberships_user_id_idx
  on public.memberships (user_id);

-- Last-owner checks in private.guard_membership_change().
create index memberships_active_owners_idx
  on public.memberships (organization_id)
  where role = 'owner' and status = 'active';

-- Invitation lists per organization (newest first) + FK cascade.
create index organization_invitations_organization_id_created_at_idx
  on public.organization_invitations (organization_id, created_at desc);

-- FK `on delete set null` from profiles.
create index organization_invitations_invited_by_idx
  on public.organization_invitations (invited_by)
  where invited_by is not null;

-- At most one pending invitation per email and organization.
create unique index organization_invitations_pending_email_key
  on public.organization_invitations (organization_id, email)
  where accepted_at is null;
