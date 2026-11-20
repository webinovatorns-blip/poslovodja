-- Local development seed. Runs only on `supabase db reset` against the LOCAL
-- stack; never applied to hosted projects by `db push`.
--
-- Accounts (password for all: poslovodja-dev-123):
--   vlasnik@poslovodja.test  owner of "Majstor Plus" (majstor-plus)
--   radnik@poslovodja.test   worker in "Majstor Plus"
--   drugi@poslovodja.test    owner of "Druga Firma" (druga-firma) - for isolation checks

do $$
declare
  v_owner uuid := '11111111-1111-4111-8111-111111111111';
  v_worker uuid := '22222222-2222-4222-8222-222222222222';
  v_other uuid := '33333333-3333-4333-8333-333333333333';
  v_org uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  v_org_other uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  v_user record;
begin
  for v_user in
    select * from (values
      (v_owner, 'vlasnik@poslovodja.test', 'Marko Marković'),
      (v_worker, 'radnik@poslovodja.test', 'Petar Petrović'),
      (v_other, 'drugi@poslovodja.test', 'Jovana Jovanović')
    ) as t(id, email, full_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated',
      v_user.email, extensions.crypt('poslovodja-dev-123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_user.full_name), now(), now(),
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user.id, v_user.id::text, 'email',
      jsonb_build_object('sub', v_user.id::text, 'email', v_user.email, 'email_verified', true),
      now(), now(), now()
    );
  end loop;

  insert into public.organizations (id, name, slug, business_type, city, email)
  values
    (v_org, 'Majstor Plus', 'majstor-plus', 'Elektroinstalacije', 'Beograd', 'kontakt@majstor-plus.test'),
    (v_org_other, 'Druga Firma', 'druga-firma', 'Vodoinstalacije', 'Novi Sad', null);

  insert into public.memberships (organization_id, user_id, role, status)
  values
    (v_org, v_owner, 'owner', 'active'),
    (v_org, v_worker, 'worker', 'active'),
    (v_org_other, v_other, 'owner', 'active');
end;
$$;
