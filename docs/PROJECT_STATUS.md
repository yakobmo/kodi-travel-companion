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
- Supabase bridge verification endpoint for safe write/read testing before switching live storage.
- Supabase-backed demo storage driver behind `STORAGE_DRIVER=supabase`.
- Group chat messages backed by the relational `group_messages` table when Supabase is active.
- Group members, consent, and live locations backed by `trip_members`, `location_sharing_consents`, and `live_locations` when Supabase is active.

## Current Storage

The MVP supports two storage modes:

- `file`: local fallback using `.data/demo-state.json`
- `supabase`: server-side storage through `public.demo_storage_states`
- Production default: Supabase when server credentials exist; `STORAGE_DRIVER=file` can force fallback.
- Realtime: ready only when `STORAGE_DRIVER=supabase`
- Migration target: managed DB plus realtime

The API exposes this through:

```text
GET /api/trips/demo/storage
```

The endpoint now reports:

- Active driver: `file`
- Requested driver: `file` or `supabase`
- Whether server-side Supabase configuration is present
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
8. Verify Supabase bridge write/read from the live Render service. Done.
9. Add a Supabase storage driver beside the current file driver. Done.
10. Switch production storage only after the full runtime driver passes QA. Done.

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
- Latest pushed commit: `43d58e5 Add guarded Supabase grants automation endpoint`
- Remote: `https://github.com/yakobmo/kodi-travel-companion.git`
- Remote status: `origin/main` verified

The app is prepared for a single Render web service. The API serves both `/api/*` and the built React app from the same service.

Current Render state:

- Service name: `kodi-travel-companion`
- Service ID: `srv-d8u2lr0js32c73cajpqg`
- Public URL: `https://kodi-travel-companion.onrender.com`
- Status: live
- Last public smoke: passed on `2026-06-25`

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
- Remaining demo state still uses the JSON bridge until migrated

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
