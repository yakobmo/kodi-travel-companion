-- Kodi trip setup state migration.
-- Stores the onboarding/activation state on trip_groups instead of the JSON bridge.
-- No secrets belong in this file.

alter table public.trip_groups
  add column if not exists setup_first_member_name text,
  add column if not exists setup_first_member_age int check (
    setup_first_member_age is null or (setup_first_member_age >= 0 and setup_first_member_age <= 120)
  ),
  add column if not exists ai_plan_confirmed boolean not null default false,
  add column if not exists location_consent_explained boolean not null default false,
  add column if not exists setup_saved_at timestamptz;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

notify pgrst, 'reload schema';

