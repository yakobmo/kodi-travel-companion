-- Kodi Travel Companion production data model.
-- Apply this file in Supabase SQL Editor after creating the project.
-- No secrets belong in this file.

create extension if not exists "pgcrypto";

do $$
begin
  create type public.member_role as enum ('owner', 'admin', 'member', 'viewer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.place_type as enum ('lodging', 'attraction', 'water', 'food', 'transport', 'stop', 'unknown');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.visit_state as enum ('unvisited', 'visited', 'skipped', 'favorite');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.location_sharing_state as enum ('enabled', 'disabled', 'pending');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.message_source as enum ('member', 'agent', 'system');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.route_status as enum ('draft', 'approved', 'completed');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.location_source as enum ('gps', 'demo', 'manual');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.trip_event_type as enum (
    'message_created',
    'location_updated',
    'destination_set',
    'route_created',
    'route_progressed',
    'member_joined',
    'member_left',
    'notification_enabled',
    'setup_updated',
    'system'
  );
exception
  when duplicate_object then null;
end $$;

alter type public.trip_event_type add value if not exists 'member_joined';
alter type public.trip_event_type add value if not exists 'member_left';
alter type public.trip_event_type add value if not exists 'notification_enabled';

create table if not exists public.trip_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  google_source_url text,
  google_source_state text not null default 'not_connected',
  owner_member_id uuid,
  setup_first_member_name text,
  setup_first_member_age int check (
    setup_first_member_age is null or (setup_first_member_age >= 0 and setup_first_member_age <= 120)
  ),
  ai_plan_confirmed boolean not null default false,
  location_consent_explained boolean not null default false,
  setup_saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  display_name text not null,
  age int check (age is null or (age >= 0 and age <= 120)),
  role public.member_role not null default 'member',
  can_chat_with_agent boolean not null default true,
  can_mark_visited boolean not null default false,
  can_manage_places boolean not null default false,
  can_manage_members boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trip_groups_owner_member_fk'
  ) then
    alter table public.trip_groups
      add constraint trip_groups_owner_member_fk
      foreign key (owner_member_id) references public.trip_members(id)
      deferrable initially deferred;
  end if;
end $$;

create table if not exists public.trip_places (
  id uuid primary key default gen_random_uuid(),
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  source_id text,
  source_place_id text,
  source_index int,
  name text not null,
  type public.place_type not null default 'unknown',
  address text,
  lat double precision,
  lng double precision,
  note text,
  tags text[] not null default '{}',
  visit_state public.visit_state not null default 'unvisited',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((lat is null and lng is null) or (lat between -90 and 90 and lng between -180 and 180))
);

create table if not exists public.location_sharing_consents (
  member_id uuid primary key references public.trip_members(id) on delete cascade,
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  state public.location_sharing_state not null default 'pending',
  updated_at timestamptz not null default now()
);

create table if not exists public.live_locations (
  member_id uuid primary key references public.trip_members(id) on delete cascade,
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  source public.location_source not null default 'gps',
  updated_at timestamptz not null default now()
);

create table if not exists public.group_messages (
  id uuid primary key default gen_random_uuid(),
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  member_id uuid references public.trip_members(id) on delete set null,
  author text not null,
  text text not null,
  source public.message_source not null,
  created_at timestamptz not null default now()
);

create table if not exists public.group_destinations (
  trip_group_id uuid primary key references public.trip_groups(id) on delete cascade,
  place_id uuid not null references public.trip_places(id) on delete cascade,
  set_by_member_id uuid not null references public.trip_members(id),
  set_at timestamptz not null default now()
);

create table if not exists public.group_routes (
  id uuid primary key default gen_random_uuid(),
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  title text not null,
  status public.route_status not null default 'draft',
  active_stop_index int not null default 0 check (active_stop_index >= 0),
  created_by_member_id uuid not null references public.trip_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.group_route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.group_routes(id) on delete cascade,
  place_id uuid not null references public.trip_places(id) on delete cascade,
  stop_order int not null check (stop_order > 0),
  completed_at timestamptz,
  unique (route_id, stop_order),
  unique (route_id, place_id)
);

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

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.notification_preferences (
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  chat_messages_enabled boolean not null default false,
  kodi_mentions_enabled boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now(),
  primary key (trip_group_id, member_id)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  message_id uuid references public.group_messages(id) on delete cascade,
  recipient_member_id uuid not null references public.trip_members(id) on delete cascade,
  subscription_id uuid references public.push_subscriptions(id) on delete set null,
  status text not null check (status in ('pending', 'sent', 'failed', 'revoked', 'skipped')),
  provider_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.demo_storage_states (
  storage_key text primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists trip_members_trip_group_id_idx on public.trip_members(trip_group_id);
create index if not exists trip_places_trip_group_id_idx on public.trip_places(trip_group_id);
create index if not exists trip_places_type_idx on public.trip_places(type);
create unique index if not exists trip_places_trip_group_source_place_idx
  on public.trip_places(trip_group_id, source_place_id)
  where source_place_id is not null;
create index if not exists group_messages_trip_created_idx on public.group_messages(trip_group_id, created_at desc);
create index if not exists live_locations_trip_group_id_idx on public.live_locations(trip_group_id);
create index if not exists group_routes_trip_group_id_idx on public.group_routes(trip_group_id);
create index if not exists group_route_stops_route_order_idx on public.group_route_stops(route_id, stop_order);
create index if not exists group_events_trip_created_idx on public.group_events(trip_group_id, created_at desc);
create index if not exists push_subscriptions_member_idx on public.push_subscriptions(member_id) where revoked_at is null;
create index if not exists notification_deliveries_trip_created_idx on public.notification_deliveries(trip_group_id, created_at desc);
create index if not exists demo_storage_states_updated_at_idx on public.demo_storage_states(updated_at desc);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_messages'
  ) then
    alter publication supabase_realtime add table public.group_messages;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_events'
  ) then
    alter publication supabase_realtime add table public.group_events;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'live_locations'
  ) then
    alter publication supabase_realtime add table public.live_locations;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_destinations'
  ) then
    alter publication supabase_realtime add table public.group_destinations;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_routes'
  ) then
    alter publication supabase_realtime add table public.group_routes;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'group_route_stops'
  ) then
    alter publication supabase_realtime add table public.group_route_stops;
  end if;
end $$;

alter table public.trip_groups enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_places enable row level security;
alter table public.location_sharing_consents enable row level security;
alter table public.live_locations enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_destinations enable row level security;
alter table public.group_routes enable row level security;
alter table public.group_route_stops enable row level security;
alter table public.group_events enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.demo_storage_states enable row level security;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;

notify pgrst, 'reload schema';

-- MVP note:
-- RLS policies are intentionally not opened here.
-- The first Supabase driver should use server-side service-role access only.
-- User-facing OAuth/RLS policies belong to the later Google auth gate.
