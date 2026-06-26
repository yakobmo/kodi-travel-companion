-- Kodi event log migration.
-- Adds a durable event stream foundation for realtime group activity.
-- No secrets belong in this file.

do $$
begin
  create type public.trip_event_type as enum (
    'message_created',
    'location_updated',
    'destination_set',
    'route_created',
    'route_progressed',
    'setup_updated',
    'system'
  );
exception
  when duplicate_object then null;
end $$;

create table if not exists public.group_events (
  id uuid primary key default gen_random_uuid(),
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  event_type public.trip_event_type not null,
  actor_member_id uuid references public.trip_members(id) on delete set null,
  actor_name text,
  related_entity_id text,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists group_events_trip_created_idx on public.group_events(trip_group_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_events'
  ) then
    alter publication supabase_realtime add table public.group_events;
  end if;
end $$;

alter table public.group_events enable row level security;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

notify pgrst, 'reload schema';
