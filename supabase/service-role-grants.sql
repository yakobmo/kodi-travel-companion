-- Kodi service-role grants.
-- Apply after schema creation when PostgREST reports:
-- "permission denied for table demo_storage_states".

grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
alter default privileges in schema public grant all privileges on tables to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;

notify pgrst, 'reload schema';
