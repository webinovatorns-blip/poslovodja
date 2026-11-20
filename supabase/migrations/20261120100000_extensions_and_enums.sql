-- Migration 1/5: extensions, private schema and enum types.

-- pgcrypto provides gen_random_bytes() and digest() for invitation tokens.
-- Supabase installs it in the `extensions` schema; this is a no-op there.
create extension if not exists pgcrypto with schema extensions;

-- `private` holds RLS helpers and trigger functions. It is NOT listed in
-- [api].schemas, so PostgREST never exposes it. Roles get USAGE only so that
-- RLS policies (evaluated as the calling role) can call the helpers.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

comment on schema private is
  'Internal helpers for RLS and triggers. Not exposed through the Data API.';

-- Roles inside an organization, from most to least privileged.
create type public.member_role as enum ('owner', 'admin', 'manager', 'worker');

-- `invited` is reserved for future flows; invitations currently live in
-- organization_invitations and create `active` memberships on acceptance.
create type public.membership_status as enum ('invited', 'active', 'suspended');
