-- Invitations: who can invite, token hashing, single-use atomic acceptance.
begin;
\ir _helpers.psql
select no_plan();

create temporary table _inv (label text primary key, id uuid, token text) on commit drop;
grant all on _inv to authenticated;

select tests.create_user('invitee');
select tests.create_user('invitee2');

-- 4. Worker (and manager) cannot invite.
select tests.authenticate_as('worker_a');
select throws_ok(
  $$ select * from public.create_organization_invitation(tests.org_id('a'), 'invitee@poslovodja.test') $$,
  '42501', 'insufficient_role', '[4] worker cannot invite a new member'
);
select throws_ok(
  $$ insert into public.organization_invitations (organization_id, email, role, token_hash, expires_at)
     values (tests.org_id('a'), 'invitee@poslovodja.test', 'worker', repeat('a', 64), now() + interval '1 day') $$,
  '42501', null, '[4] worker cannot insert invitations directly'
);
select tests.clear_authentication();

select tests.authenticate_as('manager_a');
select throws_ok(
  $$ select * from public.create_organization_invitation(tests.org_id('a'), 'invitee@poslovodja.test') $$,
  '42501', 'insufficient_role', 'manager cannot invite'
);
select tests.clear_authentication();

-- Owner of another org cannot invite into A.
select tests.authenticate_as('owner_b');
select throws_ok(
  $$ select * from public.create_organization_invitation(tests.org_id('a'), 'invitee@poslovodja.test') $$,
  '42501', 'insufficient_role', 'owner of B cannot invite into A'
);
select tests.clear_authentication();

-- Only an owner may invite an owner.
select tests.authenticate_as('admin_a');
select throws_ok(
  $$ select * from public.create_organization_invitation(tests.org_id('a'), 'invitee@poslovodja.test', 'owner') $$,
  '42501', 'only_owner_can_invite_owner', 'admin cannot invite an owner'
);
select lives_ok(
  $$ insert into _inv select 'admin_worker', invitation_id, token
     from public.create_organization_invitation(tests.org_id('a'), 'invitee2@poslovodja.test', 'worker') $$,
  'admin can invite a worker'
);
select throws_ok(
  $$ select * from public.create_organization_invitation(tests.org_id('a'), 'worker_a@poslovodja.test') $$,
  'P0001', 'already_member', 'existing members cannot be invited again'
);
select throws_ok(
  $$ select * from public.create_organization_invitation(tests.org_id('a'), 'nije-email') $$,
  '22023', 'invalid_email', 'invalid email is rejected'
);
select throws_ok(
  $$ select * from public.create_organization_invitation(tests.org_id('a'), 'x@poslovodja.test', 'worker', interval '90 days') $$,
  '22023', 'invalid_expiry', 'invitation lifetime is bounded (max 30 days)'
);
select tests.clear_authentication();

-- 6. Owner can invite (including as owner).
select tests.authenticate_as('owner_a');
select lives_ok(
  $$ insert into _inv select 'owner_invite', invitation_id, token
     from public.create_organization_invitation(tests.org_id('a'), '  INVITEE@poslovodja.test ', 'manager') $$,
  '[6] owner can invite a member'
);
select isnt_empty(
  $$ select id, email, role, expires_at from public.organization_invitations
     where id = (select id from _inv where label = 'owner_invite') $$,
  'owner can see the invitation'
);
select throws_ok(
  $$ select token_hash from public.organization_invitations $$,
  '42501', null, 'token_hash is not readable through the API'
);
select tests.clear_authentication();

select is(
  (select email || '|' || role::text || '|' || (invited_by = tests.user_id('owner_a'))::text
   from public.organization_invitations where id = (select id from _inv where label = 'owner_invite')),
  'invitee@poslovodja.test|manager|true',
  'invitation stores normalized email, role and inviter'
);
select ok(
  (select i.token_hash = encode(extensions.digest(t.token, 'sha256'), 'hex')
          and i.token_hash <> t.token
   from public.organization_invitations i join _inv t on t.id = i.id
   where t.label = 'owner_invite'),
  'only the SHA-256 hash of the token is stored, never the token itself'
);
select ok(
  (select expires_at > now() and expires_at <= now() + interval '7 days'
   from public.organization_invitations where id = (select id from _inv where label = 'owner_invite')),
  'invitation has an expiry (default 7 days)'
);
select throws_ok(
  $$ update public.organization_invitations set expires_at = null $$,
  '23502', null, 'expires_at is mandatory'
);

-- Members who are not owner/admin can't see invitations.
select tests.authenticate_as('worker_a');
select is_empty($$ select id from public.organization_invitations $$, 'worker cannot see invitations');
select tests.clear_authentication();

-- 10. Invalid, foreign or used invitations cannot be accepted.
select tests.authenticate_as('invitee');
select throws_ok(
  $$ select public.accept_organization_invitation(repeat('0', 64)) $$,
  'P0001', 'invitation_invalid', '[10] unknown token is rejected'
);
select throws_ok(
  $$ select public.accept_organization_invitation('not-a-token') $$,
  'P0001', 'invitation_invalid', '[10] malformed token is rejected'
);
select throws_ok(
  $$ select public.accept_organization_invitation((select token from _inv where label = 'admin_worker')) $$,
  'P0001', 'invitation_invalid', '[10] invitation addressed to another email is rejected'
);

-- Valid acceptance.
select is(
  public.accept_organization_invitation((select token from _inv where label = 'owner_invite')),
  tests.org_id('a'),
  'invitee accepts and gets the organization id back'
);
select results_eq(
  $$ select role::text, status::text from public.memberships
     where organization_id = tests.org_id('a') and user_id = tests.user_id('invitee') $$,
  $$ values ('manager', 'active') $$,
  'acceptance creates an active membership with the invited role'
);
select results_eq(
  $$ select id from public.organizations $$,
  $$ select tests.org_id('a') $$,
  'new member can now see the organization'
);
select throws_ok(
  $$ select public.accept_organization_invitation((select token from _inv where label = 'owner_invite')) $$,
  'P0001', 'invitation_invalid', '[10] a used invitation cannot be accepted again'
);
select tests.clear_authentication();

select isnt(
  (select accepted_at from public.organization_invitations where id = (select id from _inv where label = 'owner_invite')),
  null,
  'accepted_at is set'
);

-- Expired invitation.
select tests.authenticate_as('owner_a');
insert into _inv select 'expiring', invitation_id, token
  from public.create_organization_invitation(tests.org_id('a'), 'invitee2@poslovodja.test', 'worker');
select tests.clear_authentication();
-- Simulate the passage of time (postgres bypasses RLS).
update public.organization_invitations
  set created_at = now() - interval '10 days', expires_at = now() - interval '1 second'
  where id = (select id from _inv where label = 'expiring');

select is(
  (select count(*)::int from public.organization_invitations
   where email = 'invitee2@poslovodja.test' and accepted_at is null),
  1,
  're-inviting the same email replaces the pending invitation'
);

select tests.authenticate_as('invitee2');
select throws_ok(
  $$ select public.accept_organization_invitation((select token from _inv where label = 'expiring')) $$,
  'P0001', 'invitation_invalid', '[10] an expired invitation cannot be accepted'
);
select tests.clear_authentication();
select is_empty(
  $$ select 1 from public.memberships where user_id = tests.user_id('invitee2') $$,
  'failed acceptance creates no membership'
);

-- Unconfirmed email cannot accept.
select tests.authenticate_as('owner_a');
insert into _inv select 'unconfirmed', invitation_id, token
  from public.create_organization_invitation(tests.org_id('a'), 'outsider@poslovodja.test', 'worker');
select tests.clear_authentication();
update auth.users set email_confirmed_at = null where id = tests.user_id('outsider');
select tests.authenticate_as('outsider');
select throws_ok(
  $$ select public.accept_organization_invitation((select token from _inv where label = 'unconfirmed')) $$,
  'P0001', 'invitation_invalid', 'a user with an unconfirmed email cannot accept'
);
select tests.clear_authentication();

-- Owner invitations: only owners can revoke them; admins can revoke others.
select tests.authenticate_as('owner_a');
insert into _inv select 'owner_role', invitation_id, token
  from public.create_organization_invitation(tests.org_id('a'), 'future-owner@poslovodja.test', 'owner');
select tests.clear_authentication();

select tests.authenticate_as('admin_a');
delete from public.organization_invitations where id = (select id from _inv where label = 'owner_role');
select throws_ok(
  $$ select * from public.create_organization_invitation(tests.org_id('a'), 'future-owner@poslovodja.test', 'worker') $$,
  '42501', 'only_owner_can_invite_owner', 'admin cannot replace a pending owner invitation'
);
delete from public.organization_invitations where id = (select id from _inv where label = 'unconfirmed');
select tests.clear_authentication();
select isnt_empty(
  $$ select 1 from public.organization_invitations where id = (select id from _inv where label = 'owner_role') $$,
  'admin cannot revoke an owner invitation'
);
select is_empty(
  $$ select 1 from public.organization_invitations where id = (select id from _inv where label = 'unconfirmed') $$,
  'admin can revoke a non-owner invitation'
);

select * from finish();
rollback;
