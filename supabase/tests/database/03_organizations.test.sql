-- Organization isolation, updates and controlled creation.
begin;
\ir _helpers.psql
select no_plan();

-- 1. User A sees organization A.
select tests.authenticate_as('owner_a');
select results_eq(
  $$ select id from public.organizations $$,
  $$ select tests.org_id('a') $$,
  '[1] owner A sees exactly organization A'
);

-- 2. User A does not see organization B (not even by id).
select is_empty(
  $$ select id from public.organizations where id = tests.org_id('b') $$,
  '[2] owner A cannot see organization B'
);
select is_empty(
  $$ select id from public.memberships where organization_id = tests.org_id('b') $$,
  '[2] owner A cannot see memberships of organization B'
);
select tests.clear_authentication();

select tests.authenticate_as('worker_a');
select results_eq(
  $$ select id from public.organizations $$,
  $$ select tests.org_id('a') $$,
  'a worker of A sees organization A'
);
select tests.clear_authentication();

select tests.authenticate_as('outsider');
select is_empty($$ select id from public.organizations $$, 'a user without memberships sees no organizations');
select is_empty($$ select id from public.memberships $$, 'a user without memberships sees no memberships');
select tests.clear_authentication();

-- 7. Members without owner/admin role can't change business data.
select tests.authenticate_as('worker_a');
update public.organizations set name = 'Worker rename', tax_id = '999' where id = tests.org_id('a');
select tests.clear_authentication();
select tests.authenticate_as('manager_a');
update public.organizations set name = 'Manager rename' where id = tests.org_id('a');
select tests.clear_authentication();
select is(
  (select name from public.organizations where id = tests.org_id('a')),
  'Firma A',
  '[7] worker and manager cannot update organization data'
);

select tests.authenticate_as('admin_a');
update public.organizations set name = 'Firma A d.o.o.', city = 'Novi Sad' where id = tests.org_id('a');
select tests.clear_authentication();
select is(
  (select name || '|' || city from public.organizations where id = tests.org_id('a')),
  'Firma A d.o.o.|Novi Sad',
  'admin can update organization data'
);

select tests.authenticate_as('owner_a');
update public.organizations set name = 'Hijack B' where id = tests.org_id('b');
select tests.clear_authentication();
select is(
  (select name from public.organizations where id = tests.org_id('b')),
  'Firma B',
  'owner A cannot update organization B'
);

select tests.authenticate_as('admin_a');
select throws_ok(
  $$ update public.organizations set id = gen_random_uuid() where id = tests.org_id('a') $$,
  '42501', null, 'organization id is immutable for users'
);
delete from public.organizations where id = tests.org_id('a');
select tests.clear_authentication();
select isnt_empty(
  $$ select 1 from public.organizations where id = tests.org_id('a') $$,
  'admin cannot delete the organization'
);

-- 8. Nobody can create an organization owned by someone else.
select tests.authenticate_as('outsider');
select throws_ok(
  $$ insert into public.organizations (name, slug) values ('Direct', 'direct-org') $$,
  '42501', null, '[8] direct INSERT into organizations is denied'
);
select throws_ok(
  $$ insert into public.memberships (organization_id, user_id, role)
     values (tests.org_id('b'), tests.user_id('outsider'), 'owner') $$,
  '42501', null, '[8] direct INSERT into memberships (self-made owner) is denied'
);
select throws_ok(
  $$ select public.create_organization('Tuđa', 'tudja-firma', null, tests.user_id('owner_b')) $$,
  '42883', null, '[8] create_organization has no owner parameter'
);

create temporary table _new_org on commit drop as
  select public.create_organization('  Nova Firma  ', 'Nova-Firma') as id;
select tests.clear_authentication();
grant select on _new_org to authenticated;

select results_eq(
  $$ select user_id, role::text, status::text from public.memberships
     where organization_id = (select id from _new_org) $$,
  $$ values (tests.user_id('outsider'), 'owner', 'active') $$,
  '[8] create_organization makes the CALLER the only (active) owner'
);
select is(
  (select name || '|' || slug from public.organizations where id = (select id from _new_org)),
  'Nova Firma|nova-firma',
  'create_organization trims the name and lowercases the slug'
);
select is(
  (select country_code || '|' || currency || '|' || timezone
   from public.organizations where id = (select id from _new_org)),
  'RS|RSD|Europe/Belgrade',
  'organization defaults are RS / RSD / Europe/Belgrade'
);

select tests.authenticate_as('outsider');
select throws_ok(
  $$ select public.create_organization('Duplikat', 'firma-a') $$,
  '23505', null, 'slug must be unique'
);
select throws_ok(
  $$ select public.create_organization('Loš slug', '-x-') $$,
  '23514', null, 'slug format is validated'
);
select tests.clear_authentication();

-- Atomicity: a failing create leaves neither an organization nor a membership.
select is(
  (select count(*)::int from public.organizations where slug in ('firma-a', '-x-')),
  1,
  'failed create_organization calls leave no organization behind'
);

-- Owner can delete their organization; memberships cascade.
select tests.authenticate_as('owner_b');
delete from public.organizations where id = tests.org_id('b');
select tests.clear_authentication();
select is_empty(
  $$ select 1 from public.memberships where organization_id = tests.org_id('b') $$,
  'deleting an organization removes its memberships (even the last owner)'
);

select * from finish();
rollback;
