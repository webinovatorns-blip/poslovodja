-- Structural security guarantees: RLS on, no anon access, hardened functions.
begin;
\ir _helpers.psql
select no_plan();

-- RLS is enabled on every tenant table (requirement 12).
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('public.profiles'::regclass, 'public.organizations'::regclass,
                   'public.memberships'::regclass, 'public.organization_invitations'::regclass)),
  'RLS is enabled on profiles, organizations, memberships, organization_invitations'
);

-- No table in public is left without RLS.
select is_empty(
  $$ select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity $$,
  'every table in public has RLS enabled'
);

-- anon has no table privileges at all.
select is_empty(
  $$ select table_name, privilege_type from information_schema.role_table_grants
     where grantee = 'anon' and table_schema = 'public' $$,
  'anon has no privileges on public tables'
);

-- authenticated can never INSERT/TRUNCATE tenant tables directly.
select ok(
  not has_table_privilege('authenticated', 'public.organizations', 'INSERT')
  and not has_table_privilege('authenticated', 'public.memberships', 'INSERT')
  and not has_table_privilege('authenticated', 'public.organization_invitations', 'INSERT')
  and not has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'authenticated cannot insert directly into tenant tables'
);
select ok(
  not has_table_privilege('authenticated', 'public.organizations', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.memberships', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE')
  and not has_table_privilege('authenticated', 'public.organization_invitations', 'TRUNCATE'),
  'authenticated cannot truncate tenant tables'
);
select ok(
  not has_column_privilege('authenticated', 'public.organization_invitations', 'token_hash', 'SELECT'),
  'authenticated cannot read invitation token hashes'
);
select ok(
  not has_column_privilege('authenticated', 'public.memberships', 'organization_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.memberships', 'user_id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE')
  and not has_column_privilege('authenticated', 'public.organizations', 'id', 'UPDATE'),
  'identity and tenant columns are not updatable'
);

-- Every function we own has a fixed search_path.
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') $$,
  'all public/private functions set search_path'
);

-- No function is executable by PUBLIC or anon.
select is_empty(
  $$ select p.oid::regprocedure::text from pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
       and (has_function_privilege('anon', p.oid, 'EXECUTE')
            or exists (select 1 from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                       where a.grantee = 0 and a.privilege_type = 'EXECUTE')) $$,
  'no public/private function is executable by PUBLIC or anon'
);

-- SECURITY DEFINER is limited to the documented set.
select set_eq(
  $$ select p.oid::regprocedure::text from pg_proc p
     where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace) and p.prosecdef $$,
  array[
    'private.is_org_member(uuid)',
    'private.has_org_role(uuid,member_role[])',
    'private.guard_membership_change()',
    'create_organization(text,text,text)',
    'create_organization_invitation(uuid,text,member_role,interval)',
    'accept_organization_invitation(text)',
    'list_organization_members(uuid)'
  ],
  'only the documented functions are SECURITY DEFINER'
);

select ok(
  not (select p.prosecdef from pg_proc p where p.oid = 'private.handle_new_user()'::regprocedure),
  'handle_new_user runs with invoker (minimal) privileges'
);

-- The private schema is not exposed to anon.
select ok(not has_schema_privilege('anon', 'private', 'USAGE'), 'anon has no usage on schema private');

-- Anonymous API requests see nothing and can't call RPCs (requirement 12).
select tests.authenticate_as_anon();
select throws_ok(
  $$ select count(*) from public.organizations $$,
  '42501', null, 'anon cannot read organizations'
);
select throws_ok(
  $$ select count(*) from public.profiles $$,
  '42501', null, 'anon cannot read profiles'
);
select throws_ok(
  $$ select public.create_organization('X', 'anon-org') $$,
  '42501', null, 'anon cannot call create_organization'
);
select tests.clear_authentication();

select * from finish();
rollback;
