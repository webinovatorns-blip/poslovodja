-- Membership management: roles, escalation, last owner.
begin;
\ir _helpers.psql
select no_plan();

create function pg_temp.role_of(p_label text)
returns text language sql stable as $$
  select m.role::text from public.memberships m
  where m.organization_id = tests.org_id('a') and m.user_id = tests.user_id(p_label)
$$;

-- Members see all memberships of their own organization only.
select tests.authenticate_as('worker_a');
select is(
  (select count(*)::int from public.memberships),
  4,
  'worker sees the 4 memberships of organization A and nothing else'
);

-- 3. Worker cannot change their own role (RLS filters the update: 0 rows).
update public.memberships set role = 'owner'
  where organization_id = tests.org_id('a') and user_id = tests.user_id('worker_a');
update public.memberships set role = 'admin'
  where organization_id = tests.org_id('a') and user_id = tests.user_id('worker_a');
-- ...nor anybody else's.
update public.memberships set role = 'worker'
  where organization_id = tests.org_id('a') and user_id = tests.user_id('admin_a');
delete from public.memberships
  where organization_id = tests.org_id('a') and user_id = tests.user_id('manager_a');
select tests.clear_authentication();

select is(pg_temp.role_of('worker_a'), 'worker', '[3] worker cannot change their own role');
select is(pg_temp.role_of('admin_a'), 'admin', 'worker cannot change other members'' roles');
select is(pg_temp.role_of('manager_a'), 'manager', 'worker cannot remove members');

-- Manager cannot manage memberships either.
select tests.authenticate_as('manager_a');
update public.memberships set role = 'admin'
  where organization_id = tests.org_id('a') and user_id = tests.user_id('worker_a');
select tests.clear_authentication();
select is(pg_temp.role_of('worker_a'), 'worker', 'manager cannot change roles');

-- 5. Admin cannot make themselves owner.
select tests.authenticate_as('admin_a');
select throws_ok(
  $$ update public.memberships set role = 'owner'
     where organization_id = tests.org_id('a') and user_id = tests.user_id('admin_a') $$,
  '42501', 'cannot_elevate_own_role', '[5] admin cannot grant themselves owner'
);
-- ...or anybody else.
select throws_ok(
  $$ update public.memberships set role = 'owner'
     where organization_id = tests.org_id('a') and user_id = tests.user_id('manager_a') $$,
  '42501', 'only_owner_can_manage_owners', 'admin cannot grant owner to others'
);
select throws_ok(
  $$ update public.memberships set role = 'admin'
     where organization_id = tests.org_id('a') and user_id = tests.user_id('owner_a') $$,
  '42501', 'only_owner_can_manage_owners', 'admin cannot demote an owner'
);
select throws_ok(
  $$ delete from public.memberships
     where organization_id = tests.org_id('a') and user_id = tests.user_id('owner_a') $$,
  '42501', 'only_owner_can_manage_owners', 'admin cannot remove an owner'
);
select throws_ok(
  $$ update public.memberships set status = 'suspended'
     where organization_id = tests.org_id('a') and user_id = tests.user_id('admin_a') $$,
  '42501', 'cannot_change_own_status', 'admin cannot change their own status'
);
select throws_ok(
  $$ update public.memberships set user_id = tests.user_id('outsider')
     where organization_id = tests.org_id('a') and user_id = tests.user_id('worker_a') $$,
  '42501', null, 'membership user_id is immutable'
);

-- Admin can manage non-owner members.
select lives_ok(
  $$ update public.memberships set role = 'manager'
     where organization_id = tests.org_id('a') and user_id = tests.user_id('worker_a') $$,
  'admin can promote a worker to manager'
);
select lives_ok(
  $$ update public.memberships set status = 'suspended'
     where organization_id = tests.org_id('a') and user_id = tests.user_id('worker_a') $$,
  'admin can suspend a member'
);
select tests.clear_authentication();
select is(pg_temp.role_of('worker_a'), 'manager', 'admin role change is applied');

-- A suspended member loses access to the organization.
select tests.authenticate_as('worker_a');
select is_empty($$ select id from public.organizations $$, 'suspended member cannot see the organization');
select is(
  (select count(*)::int from public.memberships),
  1,
  'suspended member still sees their own membership (and nothing else)'
);
select tests.clear_authentication();

-- Admin cannot manage memberships of another organization.
select tests.authenticate_as('admin_a');
update public.memberships set role = 'worker' where organization_id = tests.org_id('b');
select tests.clear_authentication();
select is(
  (select role::text from public.memberships where organization_id = tests.org_id('b')),
  'owner',
  'admin of A cannot touch memberships of B'
);

-- 9. The last active owner cannot be removed or demoted.
select tests.authenticate_as('owner_a');
select throws_ok(
  $$ update public.memberships set role = 'admin'
     where organization_id = tests.org_id('a') and user_id = tests.user_id('owner_a') $$,
  'P0001', 'last_active_owner', '[9] last owner cannot demote themselves'
);
select throws_ok(
  $$ delete from public.memberships
     where organization_id = tests.org_id('a') and user_id = tests.user_id('owner_a') $$,
  'P0001', 'last_active_owner', '[9] last owner cannot leave'
);
select tests.clear_authentication();

-- ...also not by a trusted backend (service_role / postgres): integrity rule.
select throws_ok(
  $$ update public.memberships set status = 'suspended'
     where organization_id = tests.org_id('a') and user_id = tests.user_id('owner_a') $$,
  'P0001', 'last_active_owner', '[9] last owner cannot be suspended even by the backend'
);

-- Owner transfers ownership: promote admin, then step down.
select tests.authenticate_as('owner_a');
select lives_ok(
  $$ update public.memberships set role = 'owner'
     where organization_id = tests.org_id('a') and user_id = tests.user_id('admin_a') $$,
  'owner can promote an admin to owner'
);
select lives_ok(
  $$ update public.memberships set role = 'admin'
     where organization_id = tests.org_id('a') and user_id = tests.user_id('owner_a') $$,
  'an owner can step down when another active owner exists'
);
select tests.clear_authentication();

select tests.authenticate_as('admin_a');
select throws_ok(
  $$ delete from public.memberships
     where organization_id = tests.org_id('a') and user_id = tests.user_id('admin_a') $$,
  'P0001', 'last_active_owner', '[9] the new sole owner is protected too'
);
select tests.clear_authentication();

-- A regular member can leave an organization.
select tests.authenticate_as('manager_a');
select lives_ok(
  $$ delete from public.memberships
     where organization_id = tests.org_id('a') and user_id = tests.user_id('manager_a') $$,
  'a member can leave the organization'
);
select tests.clear_authentication();
select is(pg_temp.role_of('manager_a'), null, 'membership is gone after leaving');

select * from finish();
rollback;
