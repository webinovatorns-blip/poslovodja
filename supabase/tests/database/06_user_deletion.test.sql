-- 11. Deleting a user leaves no broken references.
begin;
\ir _helpers.psql
select no_plan();

-- worker_a has a profile, a membership and has sent an invitation (as admin later).
update public.memberships set role = 'admin'
  where organization_id = tests.org_id('a') and user_id = tests.user_id('worker_a');
select tests.authenticate_as('worker_a');
select lives_ok(
  $$ select * from public.create_organization_invitation(tests.org_id('a'), 'novi@poslovodja.test') $$,
  'fixture: worker_a (now admin) sends an invitation'
);
select tests.clear_authentication();

select lives_ok(
  $$ delete from auth.users where id = tests.user_id('worker_a') $$,
  '[11] a non-owner user can be deleted'
);
select is_empty(
  $$ select 1 from public.profiles where id = tests.user_id('worker_a') $$,
  '[11] the profile is deleted with the user'
);
select is_empty(
  $$ select 1 from public.memberships where user_id = tests.user_id('worker_a') $$,
  '[11] memberships are deleted with the user'
);
select is(
  (select invited_by from public.organization_invitations where email = 'novi@poslovodja.test'),
  null,
  '[11] invitations sent by the user keep existing with invited_by = NULL'
);

-- Generic orphan checks across all references.
select is_empty(
  $$ select p.id from public.profiles p left join auth.users u on u.id = p.id where u.id is null $$,
  '[11] no profile without an auth user'
);
select is_empty(
  $$ select m.id from public.memberships m
     left join public.profiles p on p.id = m.user_id
     left join public.organizations o on o.id = m.organization_id
     where p.id is null or o.id is null $$,
  '[11] no membership without a profile or organization'
);
select is_empty(
  $$ select i.id from public.organization_invitations i
     left join public.profiles p on p.id = i.invited_by
     where i.invited_by is not null and p.id is null $$,
  '[11] no invitation pointing at a missing inviter'
);

-- The last active owner can't be deleted: that would orphan the organization.
select throws_ok(
  $$ delete from auth.users where id = tests.user_id('owner_b') $$,
  'P0001', 'last_active_owner',
  '[11] deleting the last owner is blocked instead of leaving an ownerless organization'
);
select isnt_empty(
  $$ select 1 from public.profiles where id = tests.user_id('owner_b') $$,
  'the blocked deletion left the user intact'
);

-- After deleting the organization, the former owner can be deleted.
delete from public.organizations where id = tests.org_id('b');
select lives_ok(
  $$ delete from auth.users where id = tests.user_id('owner_b') $$,
  'owner can be deleted once their organization is gone'
);

select * from finish();
rollback;
