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

## Current Storage

The MVP currently uses a local file driver:

- Driver: `file`
- State file: `.data/demo-state.json`
- Realtime: not ready
- Migration target: managed DB plus realtime

The API exposes this through:

```text
GET /api/trips/demo/storage
```

## Recommended Production Architecture

Decision:

- Render for hosting the app.
- Supabase for PostgreSQL and realtime.
- Google APIs for Maps, Places, Routes, and OAuth.
- OpenAI API for Kodi's real AI reasoning.

Do not deploy this app over any existing PB Trading Cockpit service.
PB is a separate product and must remain untouched.

## Next Infrastructure Steps

1. Create a new GitHub repository for this app.
2. Connect the local `main` branch to that new repository.
3. Configure Render as a new service.
4. Run public smoke tests after deploy.
5. Create a Supabase project.
6. Add schema for groups, members, messages, places, live locations, destinations, routes, and route stops.
7. Add a Supabase storage driver beside the current file driver.
8. Add production environment variables.

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
- Latest pushed commit: `5dbb07f Prepare single-service Render deploy`
- Remote: `https://github.com/yakobmo/kodi-travel-companion.git`
- Remote status: `origin/main` verified

The app is prepared for a single Render web service. The API serves both `/api/*` and the built React app from the same service.

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
