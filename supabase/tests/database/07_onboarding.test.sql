-- Onboarding RPC: create_organization_with_details().
begin;
\ir _helpers.psql
select no_plan();

select tests.create_user('newbie', '{"full_name": "Novi Korisnik"}');

create temporary table _onb (label text primary key, id uuid) on commit drop;
grant all on _onb to authenticated;

-- Anonymous callers can't use it.
select tests.authenticate_as_anon();
select throws_ok(
  $$ select public.create_organization_with_details(gen_random_uuid(), 'Anon', 'other') $$,
  '42501', null, 'anon cannot call create_organization_with_details'
);
select tests.clear_authentication();

select tests.authenticate_as('newbie');

-- Validation.
select throws_ok(
  $$ select public.create_organization_with_details(null, 'Firma', 'other') $$,
  '22023', 'invalid_idempotency_key', 'idempotency key is required'
);
select throws_ok(
  $$ select public.create_organization_with_details(gen_random_uuid(), '   ', 'other') $$,
  '22023', 'invalid_name', 'name is required'
);
select throws_ok(
  $$ select public.create_organization_with_details(gen_random_uuid(), 'Firma', 'nuclear') $$,
  '22023', 'invalid_business_type', 'business type must be one of the allowed keys'
);
select throws_ok(
  $$ select public.create_organization_with_details(gen_random_uuid(), 'Firma', 'other', 'RS', 'RSD', 'Mars/Olympus') $$,
  '22023', 'invalid_timezone', 'timezone must exist'
);
select throws_ok(
  $$ select public.create_organization_with_details(gen_random_uuid(), 'Firma', 'other', 'SRB') $$,
  '22023', 'invalid_country_code', 'country code must be ISO alpha-2'
);
select is_empty(
  $$ select 1 from public.memberships where user_id = tests.user_id('newbie') $$,
  'failed calls created nothing'
);

-- Success with Serbian defaults and details.
insert into _onb values (
  'first',
  public.create_organization_with_details(
    '00000000-0000-4000-8000-000000000001', '  Đorđe Šećerović Klima  ', 'hvac_service',
    p_phone => '064 123 4567', p_email => ' Info@Klima.RS ', p_tax_id => '123456789',
    p_city => 'Novi Sad'
  )
);
select results_eq(
  $$ select name, slug, business_type, country_code, currency, timezone, email, tax_id, city, address
     from public.organizations where id = (select id from _onb where label = 'first') $$,
  $$ values ('Đorđe Šećerović Klima'::text, 'djordje-secerovic-klima'::text, 'hvac_service'::text,
            'RS'::text, 'RSD'::text, 'Europe/Belgrade'::text, 'info@klima.rs'::text,
            '123456789'::text, 'Novi Sad'::text, null::text) $$,
  'organization is created with trimmed values, a server-generated slug and RS defaults'
);
select results_eq(
  $$ select user_id, role::text, status::text from public.memberships
     where organization_id = (select id from _onb where label = 'first') $$,
  $$ values (tests.user_id('newbie'), 'owner', 'active') $$,
  'caller becomes the only active owner'
);

-- Idempotency: the same key returns the same organization (double submit / retry).
select is(
  public.create_organization_with_details(
    '00000000-0000-4000-8000-000000000001', 'Drugi naziv', 'other'),
  (select id from _onb where label = 'first'),
  'repeating the call with the same idempotency key returns the first organization'
);
select is(
  (select count(*)::int from public.memberships where user_id = tests.user_id('newbie')),
  1,
  'a repeated call does not create a second organization'
);

-- Slugs stay unique: same name, new key -> suffixed slug.
insert into _onb values (
  'second',
  public.create_organization_with_details(gen_random_uuid(), 'Đorđe Šećerović Klima', 'hvac_service')
);
select ok(
  (select slug ~ '^djordje-secerovic-klima-[0-9a-f]{6}$'
   from public.organizations where id = (select id from _onb where label = 'second')),
  'a duplicate name gets a unique suffixed slug'
);

-- Very short / symbol-only names still get a valid slug.
select lives_ok(
  $$ select public.create_organization_with_details(gen_random_uuid(), '!!', 'other') $$,
  'a name without slug-able characters still creates an organization'
);
select tests.clear_authentication();

-- Another user's key space is separate: same key, different user, new org.
select tests.authenticate_as('outsider');
select isnt(
  public.create_organization_with_details(
    '00000000-0000-4000-8000-000000000001', 'Outsider firma', 'other'),
  (select id from _onb where label = 'first'),
  'idempotency keys are scoped per user (cannot claim someone else''s organization)'
);
select tests.clear_authentication();

-- Slug helper.
select is(private.slugify('Čačak Ćevapi Žika & Šiš d.o.o.'), 'cacak-cevapi-zika-sis-d-o-o', 'slugify transliterates Serbian Latin');

select * from finish();
rollback;
