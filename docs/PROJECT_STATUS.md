# AI Travel Companion - Project Status

## Product

Kodi is a Hebrew AI travel companion for a family or group trip.

The app is built around:

- A live trip map.
- Places imported from a Google Maps trip list.
- At least the trip manager's consented live location as the minimum live context anchor.
- A WhatsApp-style family group chat.
- Kodi as a participant in that chat.
- Waze and Google Maps navigation links.
- Group permissions: everyone can speak, only owner/admin can perform operational changes.
- Opt-in live member location sharing.
- Group destination and group route state.
- One owner-managed trip usage pool, so family members do not need separate paid AI subscriptions.

Product-heart decision: the primary experience is Kodi + map + trip points + at least the manager's live location. Group member locations, external app shortcuts, participant management, usage visibility, and admin tools are important, but they should not crowd the first-run path.

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
- Non-active Google API adapter skeleton and readiness endpoint through `/api/trips/demo/google-source/readiness`, reporting only configured/not-configured status for future Google environment requirements.
- Guarded Google Places Text Search read path through `/api/google/places/text-search`, returning live Google Places results when `GOOGLE_MAPS_API_KEY` exists and never exposing credential values.
- Kodi agent server flow can call the guarded Places read path for nearby external needs such as gelato, food, bathrooms, pharmacies, or nearby services, while clearly explaining `not_configured` when the Google key is absent.
- Live Google Places smoke automation through `npm run smoke:google-places-live`, verifying real Places results and Kodi agent context after `GOOGLE_MAPS_API_KEY` is configured in Render.
- Google Routes ETA read path through `/api/google/routes/estimate`, using the same server-side `GOOGLE_MAPS_API_KEY` guard, narrow field masks, and no credential exposure.
- Trip Context Resolver for Kodi agent questions, so time/distance questions use live location, group destination, active route, and lodging context with confidence levels instead of choosing a stale first hotel.
- Kodi asks a clarification question when the trip context is ambiguous, instead of pretending it knows which hotel, stop, or reference point the family means.
- Trip Timeline Resolver through `/api/trips/demo/timeline`, deriving lodging-based trip segments from the imported Google map order, date hints, and region hints.
- Kodi agent external searches now prefer a resolved future trip segment, such as Pelion lodging, before falling back to live GPS or the first known place.
- Product ownership model documented: Kodi runs through the backend as one shared trip-space agent, with the owner/admin controlling billing, usage, and operational permissions.
- Owner-managed usage pool endpoint through `/api/trips/demo/usage`, exposing safe billing/usage policy without provider secrets.
- Usage gate now wraps costly Google Places and Google Routes calls, including calls made through Kodi's agent flow, before any provider request is attempted.
- Usage-gate authorizations are written into the group event log as system audit events, so direct API calls and Kodi agent calls leave an operational trail.
- Owner-visible usage audit summary is exposed through `/api/trips/demo/usage` and shown in the chat surface next to live group activity.
- Core experience and onboarding product gate documented in `docs/CORE_EXPERIENCE_AND_ONBOARDING.md`: one clear next action, manager location as minimum live context, and secondary actions kept out of the main flow.
- Guided first-run activation added: Kodi leads one step at a time through activation, trip source, manager GPS, and then entry into the map/chat core.

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
- Central backend usage pool per trip owner/group, instead of each member bringing a separate AI subscription.

Usage and billing decision:

- Trip owner creates the trip space and owns the usage pool.
- Members can talk to Kodi without separate OpenAI/Google API credentials.
- Backend holds all private provider secrets and enforces role permissions, quotas, and audit.
- Costly calls should be attributed to trip group and triggering member.

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

These secrets remain backend-only. They must not be sent to member browsers or copied into participant devices.

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
- Google API readiness skeleton added on `2026-06-28`; local build, QA, local smoke, Render deploy, and public API smoke passed. The readiness endpoint exposes only requirement names and configured booleans, not credential values.
- First real Google read path selected on `2026-06-29`: Places API Text Search before OAuth. Local build, QA, local smoke, Render deploy, and public API smoke passed in guarded `not_configured` mode.
- Kodi agent Places context connection added on `2026-06-29`; local build, QA, local smoke, Render deploy, and public smoke passed in guarded `not_configured` mode.
- Live Google Places smoke automation added on `2026-06-29`; public production smoke passed after adding `GOOGLE_MAPS_API_KEY` to Render. Result: `placesCount=2`, first place `Cuore Amabile Gelateria`, Kodi agent external Places status `ready`, storage driver `supabase`.
- Trip Context Resolver and guarded Google Routes ETA path added on `2026-06-29`; local build, QA, smoke, focused agent checks, GitHub push, Render deploy, and public endpoint exposure passed. Public Routes live smoke is blocked by Google Cloud `PERMISSION_DENIED` until `Routes API` is enabled for the same Google Cloud project as the Maps key. Generic nearby requests now route to Google Places from the natural user text, while ambiguous ETA questions ask a clarification before calling Routes.
- Trip Timeline Resolver added on `2026-06-29`; local build, QA, local smoke, Render deploy, and public smoke passed. Public result: timeline returned 10 lodging segments, Kodi resolved a Pelion future lodging reference with `medium` confidence, and Google Places status was `ready`.
- Trip usage pool API foundation added on `2026-06-29`; local build, QA, local smoke, Render deploy, and public smoke passed. Public result: Supabase storage active, owner-managed usage pool, participant billing disabled, backend mediation enabled, no private provider keys to browsers, and 4 tracked provider capabilities.
- Trip usage gate added on `2026-06-29`; local build, QA, local smoke, Render deploy, and public smoke passed. Direct Google endpoints and Kodi agent calls now return `usageGate` evidence showing `usage_pool_authorized` and `chargedTo=trip_usage_pool`; production Places status is `ready`.
- Usage-gate audit events added on `2026-06-29`; local build, QA, local smoke, Render deploy, and public smoke passed. Direct Google usage and Kodi agent usage now record `system` events with capability, source, charge target, and provider configuration state.
- Owner-visible usage audit overview added on `2026-06-29`; local build, QA, local smoke, Render deploy, and public smoke passed. `/api/trips/demo/usage` now returns `usageAudit`, and the web app shows compact usage counts near live activity.
- Guided activation flow added on `2026-06-29`; local build, QA, and local smoke passed. The first-run UI now shows one step at a time: activate Kodi, choose trip source/demo, enable manager GPS, then enter the map/chat core.

## Next Continuation Checkpoint

Resume from the Kodi build protocol with no new product discovery.

Immediate next task:

1. Enable `Routes API` in Google Cloud for the existing Maps Platform project.
2. Run public smoke for `/api/google/routes/estimate` and a Kodi chat ETA request.
3. Continue evolving Kodi as a true agent: natural request -> trip timeline/context resolution -> Google Places/Routes -> answer or clarification.
4. Keep OAuth and write-back disabled until a proven, permissioned Google account path exists.
5. Add persistent usage-pool/account fields before real paid multi-family usage.

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
