-- Kodi Travel Companion production data model.
-- Apply this file in Supabase SQL Editor after creating the project.
-- No secrets belong in this file.

create extension if not exists "pgcrypto";

create type public.member_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.place_type as enum ('lodging', 'attraction', 'water', 'food', 'transport', 'stop', 'unknown');
create type public.visit_state as enum ('unvisited', 'visited', 'skipped', 'favorite');
create type public.location_sharing_state as enum ('enabled', 'disabled', 'pending');
create type public.message_source as enum ('member', 'agent', 'system');
create type public.route_status as enum ('draft', 'approved', 'completed');
create type public.location_source as enum ('gps', 'demo', 'manual');

create table public.trip_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  google_source_url text,
  google_source_state text not null default 'not_connected',
  owner_member_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.trip_members (
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

alter table public.trip_groups
  add constraint trip_groups_owner_member_fk
  foreign key (owner_member_id) references public.trip_members(id)
  deferrable initially deferred;

create table public.trip_places (
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
  unique (trip_group_id, source_id),
  check ((lat is null and lng is null) or (lat between -90 and 90 and lng between -180 and 180))
);

create table public.location_sharing_consents (
  member_id uuid primary key references public.trip_members(id) on delete cascade,
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  state public.location_sharing_state not null default 'pending',
  updated_at timestamptz not null default now()
);

create table public.live_locations (
  member_id uuid primary key references public.trip_members(id) on delete cascade,
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_meters double precision check (accuracy_meters is null or accuracy_meters >= 0),
  source public.location_source not null default 'gps',
  updated_at timestamptz not null default now()
);

create table public.group_messages (
  id uuid primary key default gen_random_uuid(),
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  member_id uuid references public.trip_members(id) on delete set null,
  author text not null,
  text text not null,
  source public.message_source not null,
  created_at timestamptz not null default now()
);

create table public.group_destinations (
  trip_group_id uuid primary key references public.trip_groups(id) on delete cascade,
  place_id uuid not null references public.trip_places(id) on delete cascade,
  set_by_member_id uuid not null references public.trip_members(id),
  set_at timestamptz not null default now()
);

create table public.group_routes (
  id uuid primary key default gen_random_uuid(),
  trip_group_id uuid not null references public.trip_groups(id) on delete cascade,
  title text not null,
  status public.route_status not null default 'draft',
  active_stop_index int not null default 0 check (active_stop_index >= 0),
  created_by_member_id uuid not null references public.trip_members(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_route_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references public.group_routes(id) on delete cascade,
  place_id uuid not null references public.trip_places(id) on delete cascade,
  stop_order int not null check (stop_order > 0),
  completed_at timestamptz,
  unique (route_id, stop_order),
  unique (route_id, place_id)
);

create index trip_members_trip_group_id_idx on public.trip_members(trip_group_id);
create index trip_places_trip_group_id_idx on public.trip_places(trip_group_id);
create index trip_places_type_idx on public.trip_places(type);
create index group_messages_trip_created_idx on public.group_messages(trip_group_id, created_at desc);
create index live_locations_trip_group_id_idx on public.live_locations(trip_group_id);
create index group_routes_trip_group_id_idx on public.group_routes(trip_group_id);
create index group_route_stops_route_order_idx on public.group_route_stops(route_id, stop_order);

alter publication supabase_realtime add table public.group_messages;
alter publication supabase_realtime add table public.live_locations;
alter publication supabase_realtime add table public.group_destinations;
alter publication supabase_realtime add table public.group_routes;
alter publication supabase_realtime add table public.group_route_stops;

alter table public.trip_groups enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_places enable row level security;
alter table public.location_sharing_consents enable row level security;
alter table public.live_locations enable row level security;
alter table public.group_messages enable row level security;
alter table public.group_destinations enable row level security;
alter table public.group_routes enable row level security;
alter table public.group_route_stops enable row level security;

-- MVP note:
-- RLS policies are intentionally not opened here.
-- The first Supabase driver should use server-side service-role access only.
-- User-facing OAuth/RLS policies belong to the later Google auth gate.
