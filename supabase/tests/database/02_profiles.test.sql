-- Profile trigger and profile RLS.
begin;
\ir _helpers.psql
select no_plan();

-- Trigger creates a profile for every new auth user.
select is(
  (select count(*)::int from public.profiles where id in (select id from tests.fixture_users)),
  (select count(*)::int from tests.fixture_users),
  'every fixture user got a profile'
);
select is(
  (select full_name from public.profiles where id = tests.user_id('owner_a')),
  'Owner A',
  'full_name is copied from metadata'
);
select is(
  (select locale from public.profiles where id = tests.user_id('owner_a')),
  'sr-Latn',
  'locale defaults to sr-Latn'
);

-- Missing / malformed metadata never blocks sign-up.
select lives_ok(
  $$ select tests.create_user('no_meta', null) $$,
  'user with NULL metadata can be created'
);
select is(
  (select full_name from public.profiles where id = tests.user_id('no_meta')),
  null,
  'NULL metadata results in NULL full_name'
);
select lives_ok(
  $$ select tests.create_user('array_meta', '["not", "an", "object"]'::jsonb) $$,
  'user with non-object metadata can be created'
);
select lives_ok(
  $$ select tests.create_user('bad_meta', jsonb_build_object(
       'full_name', '   ' || repeat('x', 500) || '   ',
       'avatar_url', 'javascript:alert(1)',
       'phone', repeat('9', 100))) $$,
  'user with oversized / unsafe metadata can be created'
);
select is(
  (select char_length(full_name) from public.profiles where id = tests.user_id('bad_meta')),
  200,
  'oversized full_name is clamped to 200 chars'
);
select is(
  (select avatar_url from public.profiles where id = tests.user_id('bad_meta')),
  null,
  'non-https avatar_url is discarded'
);
select is(
  (select phone from public.profiles where id = tests.user_id('bad_meta')),
  null,
  'oversized phone is discarded'
);
select lives_ok(
  $$ select tests.create_user('name_fallback', '{"name": "  Fallback Name "}') $$,
  'user with only "name" metadata can be created'
);
select is(
  (select full_name from public.profiles where id = tests.user_id('name_fallback')),
  'Fallback Name',
  '"name" is used when "full_name" is missing, trimmed'
);

-- Duplicate prevention: re-running the trigger logic does not fail or duplicate.
select lives_ok(
  $$ insert into public.profiles (id) values (tests.user_id('owner_a')) on conflict do nothing $$,
  'duplicate profile insert is ignored'
);
select is(
  (select count(*)::int from public.profiles where id = tests.user_id('owner_a')),
  1,
  'still exactly one profile per user'
);

-- RLS: own profile only.
select tests.authenticate_as('worker_a');
select results_eq(
  $$ select id from public.profiles $$,
  $$ select tests.user_id('worker_a') $$,
  'a user sees only their own profile'
);
select lives_ok(
  $$ update public.profiles set full_name = 'Novi Naziv' where id = tests.user_id('worker_a') $$,
  'a user can update their own profile'
);
select is(
  (select full_name from public.profiles where id = tests.user_id('worker_a')),
  'Novi Naziv',
  'own profile update is applied'
);
update public.profiles set full_name = 'Hacked' where id = tests.user_id('owner_a');
select tests.clear_authentication();
select is(
  (select full_name from public.profiles where id = tests.user_id('owner_a')),
  'Owner A',
  'a user cannot update another user''s profile'
);

select tests.authenticate_as('worker_a');
select throws_ok(
  $$ update public.profiles set id = gen_random_uuid() where id = tests.user_id('worker_a') $$,
  '42501', null, 'profile id cannot be changed'
);
select throws_ok(
  $$ insert into public.profiles (id) values (gen_random_uuid()) $$,
  '42501', null, 'users cannot insert profiles directly'
);
select throws_ok(
  $$ delete from public.profiles where id = tests.user_id('worker_a') $$,
  '42501', null, 'users cannot delete profiles directly'
);
select tests.clear_authentication();

-- Owners/admins see only BASIC profiles of their own members via RPC.
select tests.authenticate_as('owner_a');
select set_eq(
  $$ select user_id from public.list_organization_members(tests.org_id('a')) $$,
  $$ select id from tests.fixture_users where label in ('owner_a', 'admin_a', 'manager_a', 'worker_a') $$,
  'owner lists exactly the members of their organization'
);
select throws_ok(
  $$ select * from public.list_organization_members(tests.org_id('b')) $$,
  '42501', 'insufficient_role', 'owner cannot list members of another organization'
);
select tests.clear_authentication();

select tests.authenticate_as('worker_a');
select throws_ok(
  $$ select * from public.list_organization_members(tests.org_id('a')) $$,
  '42501', 'insufficient_role', 'worker cannot list member profiles'
);
select tests.clear_authentication();

select * from finish();
rollback;
