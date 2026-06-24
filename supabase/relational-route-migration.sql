-- Kodi relational route/destination migration.
-- This fixes the trip_places uniqueness boundary so one Google source can hold many places.
-- No secrets belong in this file.

alter table public.trip_places
  drop constraint if exists trip_places_trip_group_id_source_id_key;

create unique index if not exists trip_places_trip_group_source_place_idx
  on public.trip_places(trip_group_id, source_place_id)
  where source_place_id is not null;

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

notify pgrst, 'reload schema';

