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
- A temporary `demo_storage_states` JSONB bridge table for the first runtime storage driver.

## Realtime Tables

The schema enables Supabase Realtime publication for:

- `group_messages`
- `live_locations`
- `group_destinations`
- `group_routes`
- `group_route_stops`

These are the tables that need live UI updates first.

## Privacy Boundary

Location is modeled as current location only.

The MVP schema does not store a full location history table. That is intentional: group location is a flagship feature, but it must stay consent-based and minimal.

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
5. Live Render service verified write/read access to `demo_storage_states`.

Next:

1. Implement a Supabase storage driver beside the existing file driver.
2. Keep the file driver as local fallback.
3. Run API build, local smoke, public deploy, and public smoke again.
4. Switch production storage only after the full runtime driver passes QA.

## Environment Contract

Local development should keep:

```text
STORAGE_DRIVER=file
```

Production should switch only after the Supabase runtime driver exists:

```text
STORAGE_DRIVER=supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only and must live only in Render environment variables or a local uncommitted `.env` file.

Do not expose it through any `VITE_*` variable.

Current status endpoint:

```text
GET /api/trips/demo/storage
```

This endpoint intentionally keeps `driver: "file"` and `realtimeReady: false` until the Supabase runtime driver is implemented and verified.

Runtime readiness check:

```text
GET /api/trips/demo/storage/supabase-check
```

This endpoint checks only whether the backend has Supabase server configuration and can see the bridge table. It does not expose keys.

It also reports the JWT role embedded in the configured key, for example:

```text
keyRole: service_role
```

If it reports `anon`, the wrong Supabase key was configured in Render.

Bridge write/read verification:

```text
POST /api/trips/demo/storage/supabase-bridge/verify
```

This endpoint verifies that the backend can write and read the temporary `demo_storage_states` bridge table. The live app still uses file storage until all data paths are migrated.

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

It does not print the connection string and it verifies `public.demo_storage_states` after applying the schema.

The grants script verifies that `service_role` can select, insert and update the bridge table.

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
POST /api/trips/demo/storage/supabase-bridge/verify
```

Production verification passed on `2026-06-25`:

```text
POST /api/admin/supabase/apply-grants
Result: configured=true, authorized=true, applied=true, verified=true

GET /api/trips/demo/storage/supabase-check
Result: keyRole=service_role, reachable=true, bridgeTableReady=true

POST /api/trips/demo/storage/supabase-bridge/verify
Result: writable=true, readable=true
```

## Current Project

The Supabase project was created and the live Render service can now access it through server-only credentials:

```text
Project: kodi-travel-companion
URL: https://szlziurxfvjnqzjwrhlq.supabase.co
Schema applied: 2026-06-24
Live bridge verified: 2026-06-25
```

No Supabase keys are committed to this repository.
