# Supabase Schema

This is the first production database gate for Kodi.

The schema lives in:

```text
supabase/schema.sql
```

## Scope

The schema covers:

- Trip groups.
- Members and roles.
- Google-imported trip places.
- Explicit location sharing consent.
- Current live member locations.
- Group chat messages.
- Active group destination.
- Group routes and route stops.
- Group event log for realtime activity.
- A legacy JSONB bridge table kept only for backward compatibility until a later cleanup migration.

## Realtime Tables

The schema enables Supabase Realtime publication for:

- `group_messages`
- `live_locations`
- `group_destinations`
- `group_routes`
- `group_route_stops`
- `group_events`

These are the tables that need live UI updates first.

## Privacy Boundary

Location is modeled as current location only.

The current schema does not store a full location history table. That is intentional: group location is a flagship feature, but it must stay consent-based and minimal.

## RLS Boundary

RLS is enabled on all tables, but public policies are not opened in this first gate.

The first production driver should access Supabase from the backend only, using server-side credentials in Render environment variables.

Browser clients must not receive service-role credentials.

## Next Implementation Gate

Completed:

1. Supabase project created.
2. `supabase/schema.sql` applied.
3. Server-only Render environment variables added.
4. Guarded Render grants endpoint verified.
5. Live Render service verified initial write/read access during the first storage gate.

Next:

1. Keep the file driver as local fallback. Done.
2. Implement a Supabase storage driver beside the existing file driver. Done.
3. Run API build, local smoke, public deploy, and public smoke again. Done.
4. Switch production storage only after the full runtime driver passes QA. Done.

## Environment Contract

Local development should keep:

```text
STORAGE_DRIVER=file
```

Production selects Supabase automatically when `NODE_ENV=production` and server credentials exist. It can also be forced with:

```text
STORAGE_DRIVER=supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Use `STORAGE_DRIVER=file` only as an explicit production fallback.

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must live only in Render environment variables or a local uncommitted `.env` file.

Do not expose it through any `VITE_*` variable.

Current status endpoint:

```text
GET /api/trips/{tripId}/storage
```

This endpoint reports the active driver. With `STORAGE_DRIVER=supabase` and valid server credentials, it reports `driver: "supabase"` and `realtimeReady: true`.

Runtime readiness check:

```text
GET /api/trips/{tripId}/storage/supabase-check
```

This endpoint checks only whether the backend has Supabase server configuration and can see the relational runtime tables. It does not expose keys.
It also reports `eventLogReady`, which becomes true after the event-log migration is applied.

It also reports the JWT role embedded in the configured key, for example:

```text
keyRole: service_role
```

If it reports `anon`, the wrong Supabase key was configured in Render.

Legacy bridge verification:

```text
POST /api/trips/{tripId}/storage/supabase-bridge/verify
```

This endpoint is retained as a compatibility response only. It does not write to the legacy JSON bridge; the live app uses relational Supabase tables when `STORAGE_DRIVER=supabase`.

## Automated Schema Apply

Preferred command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/apply-supabase-schema.ps1
```

If only service-role permissions need repair:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/apply-supabase-grants.ps1
```

The script reads one local-only secret:

```text
SUPABASE_DB_URL=
```

or:

```text
DATABASE_URL=
```

It does not print the connection string and it verifies the relational runtime tables after applying the schema.

The grants script verifies that `service_role` can access the relational runtime tables.

## Guarded Remote Grants Endpoint

For Render automation, the API exposes a guarded endpoint:

```text
POST /api/admin/supabase/apply-grants
Header: x-kodi-admin-token: <MIGRATION_ADMIN_TOKEN>
```

It runs only `supabase/service-role-grants.sql`; it does not accept arbitrary SQL from the request body.

Required Render-only environment variables:

```text
SUPABASE_DB_URL=
MIGRATION_ADMIN_TOKEN=
```

After running it, verify:

```text
GET /api/trips/{tripId}/storage/supabase-check
```

Production verification passed on `2026-06-25`:

```text
POST /api/admin/supabase/apply-grants
Result: configured=true, authorized=true, applied=true, verified=true

GET /api/trips/{tripId}/storage/supabase-check
Result: keyRole=service_role, reachable=true, relationalTablesReady=true

POST /api/trips/{tripId}/storage/supabase-bridge/verify
Result: retired=true, replacement=relational_supabase_tables
```

## Current Project

The Supabase project was created and the live Render service can now access it through server-only credentials:

```text
Project: kodi-travel-companion
URL: https://szlziurxfvjnqzjwrhlq.supabase.co
Schema applied: 2026-06-24
Live bridge verified: 2026-06-25
Production storage active: 2026-06-25
First relational runtime path: group_messages
group_messages public smoke: 2026-06-25
Second relational runtime path: trip_members, location_sharing_consents, live_locations
member/location public smoke: 2026-06-25
Third relational runtime path: group_destinations, group_routes, group_route_stops
destination/route public smoke: 2026-06-25
Fourth relational runtime path: trip_groups setup columns
setup public smoke: 2026-06-25
Active JSON bridge dependency retired from runtime: 2026-06-25
Event log foundation added in code/schema: 2026-06-26
Public event smoke passed with `eventLogReady=true`: 2026-06-26
```

No Supabase keys are committed to this repository.
