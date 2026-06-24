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

After a Supabase project is created:

1. Apply `supabase/schema.sql` in the Supabase SQL Editor.
2. Add server-only Render environment variables.
3. Implement a Supabase storage driver beside the existing file driver.
4. Keep the file driver as local fallback.
5. Run API build, local smoke, public deploy, and public smoke again.
