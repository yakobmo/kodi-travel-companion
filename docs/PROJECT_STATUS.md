# AI Travel Companion - Project Status

## Product

Kodi is a Hebrew AI travel companion for a family or group trip.

The app is built around:

- A live trip map.
- Places imported from a Google Maps trip list.
- A WhatsApp-style family group chat.
- Kodi as a participant in that chat.
- Waze and Google Maps navigation links.
- Group permissions: everyone can speak, only owner/admin can perform operational changes.
- Opt-in live member location sharing.
- Group destination and group route state.

## Current MVP

Implemented locally:

- React + TypeScript web app.
- Node + Express API.
- Demo trip state with 108 imported places.
- Hebrew chat/map UI.
- Kodi wake behavior inside the group conversation.
- Active speaker selection.
- Personal GPS opt-in.
- Consent-aware group location display.
- Persistent demo state through `.data/demo-state.json`.
- Group destination approval.
- Group route creation, active stop, navigation to active stop, progress, and completion.
- Storage driver contract that prepares a future DB/realtime migration.
- Supabase SQL schema for the first DB/realtime gate.
- Supabase storage configuration gate through `.env.example` and `/api/trips/demo/storage`.
- Supabase bridge compatibility endpoint marked retired after relational runtime migration.
- Supabase relational runtime storage behind `STORAGE_DRIVER=supabase`.
- Group chat messages backed by the relational `group_messages` table when Supabase is active.
- Group members, consent, and live locations backed by `trip_members`, `location_sharing_consents`, and `live_locations` when Supabase is active.
- Group destination and route state backed by `group_destinations`, `group_routes`, and `group_route_stops` when Supabase is active.
- Trip activation/setup state backed by `trip_groups` setup columns when Supabase is active.
- Group event log foundation through `/api/trips/demo/events`, with `group_events` prepared for Supabase Realtime.
- Live activity panel in the family chat UI, polling the group event log and showing recent group activity.
- Immediate live activity refresh after user-visible group actions, so chat/location/route actions update the activity panel without waiting for the next polling cycle.
- Server-sent event stream for group activity through `/api/trips/demo/events/stream`, with browser fallback to polling.
- Server-sent event stream for group chat messages through `/api/trips/demo/messages/stream`, with browser fallback to polling.
- Server-sent event stream for member locations through `/api/trips/demo/members/stream`, with browser fallback to polling.
- Server-sent event stream for group route state through `/api/trips/demo/group-route/stream`, with browser fallback to polling.
- Server-sent event stream for group destination state through `/api/trips/demo/group-destination/stream`, with browser fallback to polling.
- Read-only Google source preview through `/api/trips/demo/google-source`, exposing imported place count, coordinate coverage, and future OAuth/API requirements without claiming live Google write-back.
- Google source adapter boundary with the active fixture adapter explicitly reporting `liveGoogleAccess=false` and `canWriteBackToGoogle=false`.

## Current Storage

The MVP supports two storage modes:

- `file`: local fallback using `.data/demo-state.json`
- `supabase`: server-side relational storage through `trip_groups`, `group_messages`, `trip_members`, `location_sharing_consents`, `live_locations`, `group_destinations`, `group_routes`, and `group_route_stops`
- Production default: Supabase when server credentials exist; `STORAGE_DRIVER=file` can force fallback.
- Realtime: ready only when `STORAGE_DRIVER=supabase`
- Migration target: relational Supabase plus realtime

The API exposes this through:

```text
GET /api/trips/demo/storage
```

The endpoint now reports:

- Active driver: `file`
- Requested driver: `file` or `supabase`
- Whether server-side Supabase configuration is present
- Whether relational storage is ready
- Whether the retired JSON bridge is active. It should be `false`.
- Realtime readiness for the active driver

## Recommended Production Architecture

Decision:

- Render for hosting the app.
- Supabase for PostgreSQL and realtime.
- Google APIs for Maps, Places, Routes, and OAuth.
- OpenAI API for Kodi's real AI reasoning.

Do not deploy this app over any existing PB Trading Cockpit service.
PB is a separate product and must remain untouched.

## Next Infrastructure Steps

1. Create a new GitHub repository for this app. Done.
2. Connect the local `main` branch to that new repository. Done.
3. Configure Render as a new service. Done.
4. Run public smoke tests after deploy. Done.
5. Create a Supabase project. Done.
6. Apply `supabase/schema.sql` for groups, members, messages, places, live locations, destinations, routes, and route stops. Done.
7. Configure Render server-only Supabase variables. Done.
8. Verify initial Supabase bridge write/read from the live Render service. Done.
9. Move runtime storage to relational Supabase tables. Done.
10. Retire active JSON bridge dependency from runtime. Done.
11. Add the first event-log foundation for Realtime/event flow. Done.

## Required Secrets Later

Do not commit these to Git:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- Google OAuth credentials

## GitHub and Render Boundary

The existing PB Trading Cockpit repository and Render service are separate and must remain untouched:

- `https://github.com/yakobmo/pb-pro-trading-cockpit`
- `https://pb-pro-trading-cockpit.onrender.com`

This travel app needs its own new GitHub repository and its own new Render service.

Current local Git state:

- Branch: `main`
- Initial commit: `3f0d825 Initial AI travel companion MVP`
- Latest pushed commit: current `origin/main` after the bridge retirement status update
- Remote: `https://github.com/yakobmo/kodi-travel-companion.git`
- Remote status: `origin/main` verified

The app is prepared for a single Render web service. The API serves both `/api/*` and the built React app from the same service.

Current Render state:

- Service name: `kodi-travel-companion`
- Service ID: `srv-d8u2lr0js32c73cajpqg`
- Public URL: `https://kodi-travel-companion.onrender.com`
- Status: live
- Last public smoke: passed on `2026-06-28`

Current Supabase state:

- Project name: `kodi-travel-companion`
- Project URL: `https://szlziurxfvjnqzjwrhlq.supabase.co`
- Schema: applied successfully through Supabase SQL Editor on `2026-06-24`
- Render environment variables: configured with server-only Supabase URL, service-role key, DB URL, and migration admin token
- Guarded grants endpoint: passed on `2026-06-25`
- Bridge verification from live Render service: write/read passed on `2026-06-25`
- Runtime driver: Supabase active in production on `2026-06-25`
- Production storage smoke: write/read passed, then demo state reset back to clean startup data
- First relational table migration: group messages use `group_messages`; public write/read smoke passed on `2026-06-25`
- Second relational table migration: member roster and live locations use relational tables; public smoke passed on `2026-06-25`
- Third relational table migration: group destination and group routes use relational tables; public smoke passed on `2026-06-25`
- Production places fixture: bundled in `data/demo-google-places.json` so Render can serve the full 108-place trip state
- Fourth relational table migration: activation/setup state uses `trip_groups`; public smoke passed on `2026-06-25`
- Active runtime no longer reads from or writes to the legacy `demo_storage_states` JSON bridge; local build, QA, smoke, and public Render smoke passed on `2026-06-26`
- Event-log schema and API foundation added on `2026-06-26`; local build, QA, local smoke, Render deploy, and public event smoke passed. Public status reports `eventLogReady=true`.
- Live activity UI connected to the event log on `2026-06-26`; local build, QA, local smoke, Render deploy, and public browser smoke passed.
- Immediate activity refresh after group actions added on `2026-06-26`; local build, QA, local smoke, Render deploy, and public browser smoke passed.
- Server-sent group activity stream added on `2026-06-26`; local build, QA, local stream smoke, Render deploy, public stream smoke, and public browser smoke passed.
- Server-sent group chat message stream added on `2026-06-26`; local build, QA, local stream smoke, Render deploy, public stream smoke, and public browser smoke passed.
- Server-sent member location stream added on `2026-06-28`; local build, QA, local stream smoke, Render deploy, public stream smoke, and public browser smoke passed.
- Server-sent group route state stream added on `2026-06-28`; local build, QA, local stream smoke, Render deploy, public stream smoke, and public browser smoke passed.
- Server-sent group destination stream added on `2026-06-28`; local build, QA, local stream smoke, Render deploy, public stream smoke, and public browser smoke passed.
- First Google integration spike added on `2026-06-28`; read-only source preview implemented with build, QA, local browser smoke, Render deploy, public API smoke, and public browser smoke passed.
- Google source adapter boundary added on `2026-06-28`; local build, QA, local smoke, Render deploy, public API smoke, and public browser smoke passed.

## Next Continuation Checkpoint

Resume from the Kodi build protocol with no new product discovery.

Immediate next task:

1. Add a non-active Google API adapter skeleton that reports `not_configured` until Google secrets exist.
2. Add a safe readiness endpoint/report for required Google environment variables without exposing secrets.
3. Keep write-back disabled until a proven, permissioned Google OAuth/API path exists.

## QA

Before every commit:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/qa.ps1
```

Build:

```powershell
$nodeDir = Join-Path (Get-Location) ".tools\node-v24.14.0-win-x64"
$env:Path = "$nodeDir;$env:Path"
& (Join-Path $nodeDir "npm.cmd") --workspace apps/api run build
& (Join-Path $nodeDir "npm.cmd") --workspace apps/web run build
```

Smoke:

```powershell
$env:BROWSER_EXECUTABLE = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
& (Join-Path $nodeDir "node.exe") .\scripts\smoke-local.mjs
```
