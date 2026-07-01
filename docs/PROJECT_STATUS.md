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

Product-language decision: Kodi should not present a trial mode to users. The product starts with a real trip account setup: manager account, Google trip source, manager location, invite link, and participant permissions. Any remaining legacy endpoint/model names are internal technical identifiers until a rename migration is completed.

Map architecture correction: Google Maps is the product map engine. Kodi does not recreate Google Maps behaviors; it adds the agent/group/trip layer on top of Google Maps and uses fallback rendering only when a browser-visible Google Maps key is not configured.

Location architecture correction: product-wise, Kodi is connected to the Google Maps context. The app should feel like normal Google Maps with Kodi over it. Implementation-wise, the browser still requires device/location permission before the app can use the user's live location; Kodi cannot silently inherit private live location from the user's Google Maps app or account.

## Current Core

Implemented locally:

- React + TypeScript web app.
- Node + Express API.
- Trip state with 108 imported places.
- Hebrew chat/map UI.
- Kodi wake behavior inside the group conversation.
- Active speaker selection.
- Personal GPS opt-in.
- Consent-aware group location display.
- Local JSON fallback state for development.
- Group destination approval.
- Group route creation, active stop, navigation to active stop, progress, and completion.
- Storage driver contract that prepares a future DB/realtime migration.
- Supabase SQL schema for the first DB/realtime gate.
- Supabase storage configuration gate through `.env.example` and `/api/trips/{tripId}/storage`.
- Supabase bridge compatibility endpoint marked retired after relational runtime migration.
- Supabase relational runtime storage behind `STORAGE_DRIVER=supabase`.
- Group chat messages backed by the relational `group_messages` table when Supabase is active.
- Group members, consent, and live locations backed by `trip_members`, `location_sharing_consents`, and `live_locations` when Supabase is active.
- Group destination and route state backed by `group_destinations`, `group_routes`, and `group_route_stops` when Supabase is active.
- Trip activation/setup state backed by `trip_groups` setup columns when Supabase is active.
- Group event log foundation through `/api/trips/{tripId}/events`, with `group_events` prepared for Supabase Realtime.
- Live activity panel in the family chat UI, polling the group event log and showing recent group activity.
- Immediate live activity refresh after user-visible group actions, so chat/location/route actions update the activity panel without waiting for the next polling cycle.
- Server-sent event stream for group activity through `/api/trips/{tripId}/events/stream`, with browser fallback to polling.
- Server-sent event stream for group chat messages through `/api/trips/{tripId}/messages/stream`, with browser fallback to polling.
- Server-sent event stream for member locations through `/api/trips/{tripId}/members/stream`, with browser fallback to polling.
- Server-sent event stream for group route state through `/api/trips/{tripId}/group-route/stream`, with browser fallback to polling.
- Server-sent event stream for group destination state through `/api/trips/{tripId}/group-destination/stream`, with browser fallback to polling.
- Read-only Google source preview through `/api/trips/{tripId}/google-source`, exposing imported place count, coordinate coverage, and future OAuth/API requirements without claiming live Google write-back.
- Google source adapter boundary with the active fixture adapter explicitly reporting `liveGoogleAccess=false` and `canWriteBackToGoogle=false`.
- Non-active Google API adapter skeleton and readiness endpoint through `/api/trips/{tripId}/google-source/readiness`, reporting only configured/not-configured status for future Google environment requirements.
- Guarded Google Places Text Search read path through `/api/google/places/text-search`, returning live Google Places results when `GOOGLE_MAPS_API_KEY` exists and never exposing credential values.
- Kodi agent server flow can call the guarded Places read path for nearby external needs such as gelato, food, bathrooms, pharmacies, or nearby services, while clearly explaining `not_configured` when the Google key is absent.
- Live Google Places smoke automation through `npm run smoke:google-places-live`, verifying real Places results and Kodi agent context after `GOOGLE_MAPS_API_KEY` is configured in Render.
- Google Routes ETA read path through `/api/google/routes/estimate`, using the same server-side `GOOGLE_MAPS_API_KEY` guard, narrow field masks, and no credential exposure.
- Trip Context Resolver for Kodi agent questions, so time/distance questions use live location, group destination, active route, and lodging context with confidence levels instead of choosing a stale first hotel.
- Kodi asks a clarification question when the trip context is ambiguous, instead of pretending it knows which hotel, stop, or reference point the family means.
- Trip Timeline Resolver through `/api/trips/{tripId}/timeline`, deriving lodging-based trip segments from the imported Google map order, date hints, and region hints.
- Kodi agent external searches now prefer a resolved future trip segment, such as Pelion lodging, before falling back to live GPS or the first known place.
- Product ownership model documented: Kodi runs through the backend as one shared trip-space agent, with the owner/admin controlling billing, usage, and operational permissions.
- Owner-managed usage pool endpoint through `/api/trips/{tripId}/usage`, exposing safe billing/usage policy without provider secrets.
- Usage gate now wraps costly Google Places and Google Routes calls, including calls made through Kodi's agent flow, before any provider request is attempted.
- Usage-gate authorizations are written into the group event log as system audit events, so direct API calls and Kodi agent calls leave an operational trail.
- Owner-visible usage audit summary is exposed through `/api/trips/{tripId}/usage` and shown in the chat surface next to live group activity.
- Core experience and onboarding product gate documented in `docs/CORE_EXPERIENCE_AND_ONBOARDING.md`: one clear next action, manager location as minimum live context, and secondary actions kept out of the main flow.
- Google Maps JS path added for the web map: when `VITE_GOOGLE_MAPS_API_KEY` is configured, the app loads Google Maps JavaScript API, centers around the manager/trip context, and places trip/member markers on Google Maps. The internal layer is now explicitly fallback-only.
- Runtime Google Maps config path added through `/api/config/maps`: the web app can now load a browser-safe Google Maps key from `GOOGLE_MAPS_BROWSER_API_KEY` or `VITE_GOOGLE_MAPS_API_KEY` at runtime, instead of depending only on Vite build-time injection. `GOOGLE_MAPS_API_KEY` remains server-side for Places/Routes and is not exposed to browsers unless explicitly allowed for controlled testing.
- Guided first-run activation added: Kodi leads one step at a time through activation, trip source, manager GPS, and then entry into the map/chat core.
- Participant invite link flow added: after the manager enters the map/chat core, the app exposes a group invite link; participants opening `?join=<tripInviteToken>` see a join screen, enter name and age, join the family conversation, and approve GPS separately from their own device.
- Mobile main-screen cleanup added: the app no longer seeds invented family chat examples, filters retired seeded chat rows from storage, and keeps participant invite, usage, shortcuts, and GPS management behind the hamburger menu on mobile.
- Default map focus now uses the manager's live GPS location: the map prioritizes trip points within a 10 km radius and falls back to the nearest points if none are inside that radius.
- Entry cleanup added: a new browser no longer skips onboarding because of the shared backend setup state, seeded demo participant names are normalized out of the UI, and secondary map/card layers are hidden on mobile until the user reaches the core experience.
- Kodi elite-agent hardening added on 2026-07-01: the OpenAI bridge now frames Kodi as a capable travel agent, not a narrow search bot, with imported Google trip places, lodging timeline, manager/member location, recent group chat, Places/Routes context, and the known Athens -> Northern Greece/Tzoumerka -> Zagori -> Pelion -> Athens trip arc.
- Live-research trigger added for questions about weather, sunset, cash, food budget, exchange/ATM/euro availability, accessibility, road access, parking, opening hours, and recent conditions. Kodi can use the OpenAI Responses web-search tool when enabled, and retries without the tool if hosted search is unavailable so the chat does not fail.
- Voice input added to the group chat composer through browser speech recognition in Hebrew, exposed as a clean microphone button next to the message box.
- Rules fallback improved for cash/exchange questions, so even without local OpenAI configuration Kodi gives cautious travel-agent guidance instead of a generic response.
- Here-and-now mode added on 2026-07-01: when the user asks about here, near me, current location, or a live trip outside the planned itinerary, Kodi uses the requesting device's live location as the active anchor and keeps the saved trip only as background context.
- Public mobile smoke on 2026-06-30 passed after entry cleanup: a clean browser lands on onboarding, does not render the main app shell, and does not show seeded demo members or map/card layers before setup.
- Public smoke on 2026-06-30 passed after manager-location map focus deploy: `/api/health`, `/api/trips/demo/storage`, and the public app shell returned successfully.
- Public smoke on 2026-06-30 passed after mobile cleanup deploy: `/api/health`, `/api/trips/demo/storage`, and `/api/trips/demo/messages` returned successfully, with retired seeded family-dialogue messages hidden from the public API.

## Current Storage

The current core supports two storage modes:

- `file`: local development fallback using the existing local JSON state file
- `supabase`: server-side relational storage through `trip_groups`, `group_messages`, `trip_members`, `location_sharing_consents`, `live_locations`, `group_destinations`, `group_routes`, and `group_route_stops`
- Production default: Supabase when server credentials exist; `STORAGE_DRIVER=file` can force fallback.
- Realtime: ready only when `STORAGE_DRIVER=supabase`
- Migration target: relational Supabase plus realtime

The API exposes this through:

```text
GET /api/trips/{tripId}/storage
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

Development-stage decision:

- Current target: a working prototype for one real trip group at a time, good enough for hands-on family testing and product learning.
- Near-term product target: multi-trip SaaS with authentication, trip ownership, invite-token API, persistent usage pools, owner-visible quotas, and billing/credits.
- Scale target: hundreds or thousands of concurrent users only after queues, rate limits, provider-cost controls, caching, monitoring, and load testing are added.
- End users never receive Render access or provider credentials; they only use the app, join trips, grant permissions, and optionally pay for a plan or trip package.

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
- Initial commit: `3f0d825` (historical initial commit)
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
- Production storage smoke: write/read passed, then trip state reset back to clean startup data
- First relational table migration: group messages use `group_messages`; public write/read smoke passed on `2026-06-25`
- Second relational table migration: member roster and live locations use relational tables; public smoke passed on `2026-06-25`
- Third relational table migration: group destination and group routes use relational tables; public smoke passed on `2026-06-25`
- Production places fixture: bundled in the repository data folder so Render can serve the full 108-place trip state
- Fourth relational table migration: activation/setup state uses `trip_groups`; public smoke passed on `2026-06-25`
- Active runtime no longer reads from or writes to the legacy JSON bridge; local build, QA, smoke, and public Render smoke passed on `2026-06-26`
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
- Trip Context Resolver and guarded Google Routes ETA path added on `2026-06-29`; local build, QA, smoke, focused agent checks, GitHub push, Render deploy, and public endpoint exposure passed. Public Routes live smoke passed on `2026-06-30` after `Routes API` was enabled in Google Cloud. Clear destination ETA questions now return Google Routes duration/distance, while ambiguous hotel questions ask a clarification before calculating.
- Live Google Routes smoke automation updated on `2026-06-30`; public production smoke now verifies both the direct Routes endpoint and Kodi's agent behavior: clear destination request -> `routeEstimateStatus=ready`, ambiguous hotel request -> clarification.
- Trip Timeline Resolver added on `2026-06-29`; local build, QA, local smoke, Render deploy, and public smoke passed. Public result: timeline returned 10 lodging segments, Kodi resolved a Pelion future lodging reference with `medium` confidence, and Google Places status was `ready`.
- Trip usage pool API foundation added on `2026-06-29`; local build, QA, local smoke, Render deploy, and public smoke passed. Public result: Supabase storage active, owner-managed usage pool, participant billing disabled, backend mediation enabled, no private provider keys to browsers, and 4 tracked provider capabilities.
- Trip usage gate added on `2026-06-29`; local build, QA, local smoke, Render deploy, and public smoke passed. Direct Google endpoints and Kodi agent calls now return `usageGate` evidence showing `usage_pool_authorized` and `chargedTo=trip_usage_pool`; production Places status is `ready`.
- Usage-gate audit events added on `2026-06-29`; local build, QA, local smoke, Render deploy, and public smoke passed. Direct Google usage and Kodi agent usage now record `system` events with capability, source, charge target, and provider configuration state.
- Owner-visible usage audit overview added on `2026-06-29`; local build, QA, local smoke, Render deploy, and public smoke passed. `/api/trips/{tripId}/usage` now returns `usageAudit`, and the web app shows compact usage counts near live activity.
- Guided activation flow added on `2026-06-29`; local build, QA, local smoke, Render deploy, and public browser/API smoke passed. The first-run UI now shows one step at a time: activate Kodi, choose trip source/trip, enable manager GPS, then enter the map/chat core.
- Guided activation cleanup added on `2026-06-29`; the hidden legacy activation panel was removed, the trip/API budget note and read-only Google preview guard remain inside the guided flow, and `npm run smoke:local` now runs the local browser smoke directly. Local build, QA, local smoke, Render deploy, and public browser/API smoke passed.
- Participant invite flow added on `2026-06-30`; local build, QA, local smoke, Render deploy, and public browser/API smoke passed. The current slice is UX/local-state only; production persistence for invited members still requires a real invite-token/member API and auth boundary.
- Trial-mode language cleanup added on `2026-06-30`; product-facing UI, onboarding setup state, README, and product docs now describe a real trip account flow instead of a trial/demo path. Local build, QA, local smoke, Render deploy, public API smoke, and public browser smoke passed. Internal legacy endpoint/module names still need a separate rename migration so production routes are not broken during a copy cleanup.
- First-run onboarding clarity pass added on `2026-06-30`; the activation flow no longer has a bypass into the main app, the trip-source step requires a valid Google Maps viewing link plus manager name and age, and returning users with completed setup skip the wizard and enter the map/chat core. Local build, QA, local browser smoke, Render deploy, and public bundle smoke passed.
- Google Maps runtime config correction added on `2026-06-30`; local API build, web build, QA, local smoke, diff check, GitHub push, Render deploy, and public smoke passed. Public result: `/api/config/maps` is live, the public bundle contains the runtime config fetch and Google Maps JS loader, Google source and usage endpoints pass, and `mapsConfigured=false` until a browser-safe Google Maps key is configured in Render.
- Browser Google Maps activation completed on `2026-06-30`; after enabling Maps JavaScript API in Google Cloud, public browser smoke passed with `google-map-active`, Google Maps JS loaded, 23 map tiles rendered, and no fallback text. Follow-up: switch script loading to the recommended async pattern and migrate markers to `AdvancedMarkerElement`.
- Product QA pass added on `2026-06-30` in `docs/PRODUCT_QA_2026-06-30.md`; result: current MVP slice conditionally passes the core product rule that Google Maps is the map and Kodi is the agent layer, with P1 gaps recorded for Google OAuth live account sync and OpenAI-backed reasoning. Manager-location onboarding primary action was corrected so the next step is clear after GPS is active. Public browser smoke passed after deploy: one primary action on the manager-location step, `google-map-active`, 23 Google map tiles, and no fallback text.
- Backend OpenAI agent bridge added on `2026-06-30`; `/api/agent/message` now authorizes `openai_agent` through the owner-managed usage pool, attempts a backend-only OpenAI response when `OPENAI_API_KEY` exists, and safely falls back to the local rules answer when the key is not configured or the model call fails. The bridge is grounded in Google Maps/trip points, recent group chat, Places/Routes results, timeline context, and admin permissions, and does not expose provider secrets to browsers. Public Render smoke passed after deploy: `/api/health`, `/api/trips/demo/usage`, and `/api/agent/message` returned successfully; production reported `openAiStatus=not_configured`, `fallbackUsed=true`, and an `openai_agent` usage-gate entry without exposing secrets.
- Live OpenAI agent activation completed on `2026-06-30`; after adding `OPENAI_API_KEY` to Render, public smoke passed with `source=openai`, `openAiStatus=ready`, `fallbackUsed=false`, and `openai_agent.enabled=true`. A future Pelion question used the trip timeline and live Google Places context, then asked a clarifying question instead of inventing which hotel the family meant.
- Live GPS tracking pass added on `2026-06-30`; the browser now uses geolocation watching instead of a one-time location read, keeps the current user/manager marker live on Google Maps, syncs approved location updates to the backend, and clears the watch when the app unmounts. Public Render smoke passed after deploy: `/api/health` returned successfully and the public web bundle contains `watchPosition`, `clearWatch`, and the live tracking copy.
- Google Maps-first location copy pass added on `2026-06-30`; product-facing UI now describes location as "live location on the map / Google Maps" instead of a separate Kodi GPS system. Local web build, QA, local browser smoke, Render deploy, and public bundle smoke passed. Public result: new live-location copy is present and the old `GPS אישי` copy is absent.
- Core screen cleanup pass added on `2026-06-30`; the primary app surface is now focused on the Google Maps area and family/Kodi chat. Selected-place actions, Waze, group destination/route controls, invite links, shortcuts, activity, usage audit, and location management are handled through the hamburger menu. Mobile fallback markers are compact pins instead of long overlapping labels. Local API/web build, QA, local smoke, visual mobile screenshot review, Render deploy, and public bundle smoke passed. Public result: `selected-place-menu` and `invite-menu` are present, with no `GPS` or broken `????` copy in the web bundle.
- Kodi chat wake gate added on `2026-07-01`; the family chat now keeps ordinary participant messages inside the group and wakes Kodi only when someone explicitly addresses Kodi/Codex. Local API/web build, QA, and local browser smoke passed, including the regression that a normal family message adds only one message while a Kodi-addressed message gets an agent reply.
- Primary surface structure cleanup added on `2026-07-01`; duplicate hidden places/action/activity/usage blocks were removed from the map and chat DOM. The primary runtime surface now structurally contains the Google Maps area, Kodi presence, and family/Kodi chat, while Waze, destination/route actions, live activity, usage audit, invite flow, shortcuts, and location management stay in the hamburger menu. Local API/web build, QA, and local browser smoke passed.
- Trip map/chat correction added on `2026-07-01`; Google Maps now keeps a stable map instance, fits the full trip map with all coordinate-backed trip points, and treats live user location as a layer on top of the trip map instead of replacing it. The hamburger menu exposes the full trip place list, not only the first/nearby place. User-facing seed names were neutralized, QA/system smoke messages are filtered out of the chat, the composer placeholder was cleared, and smoke now verifies Kodi replies in chat. Local API/web build, QA, and local browser smoke passed.
- Single-manager clean chat correction added on `2026-07-01`; the initial chat surface is empty until the real manager or invited participants write messages. Legacy messages authored by invented demo family members, QA/system probes, and corrupted question-mark text are filtered before reaching the user-facing chat. This enforces the product rule that only the manager exists until participants are explicitly invited.
- Kodi follow-up wake correction added on `2026-07-01`; after Kodi has joined the chat, natural follow-up questions about the route, landing, hotels, Athens, Northern Greece, Zagori, Tzoumerka, or Pelion wake the agent even when the message does not repeat "Kodi". This keeps the group chat conversational while preserving the rule that ordinary unrelated family messages do not summon the agent.
- Kodi elite-agent upgrade added on `2026-07-01`; the OpenAI bridge now frames Kodi as an elite travel companion, not a narrow bot. Kodi receives the imported Google trip places, lodging timeline, visible member location, recent chat, route/Places context, and the known Athens -> Northern Greece/Tzoumerka -> Zagori -> Pelion -> Athens arc. For live questions such as weather, sunset, cash budget, food budget, road access, parking, opening hours, and accessibility, Kodi can use the Responses API web-search tool from the backend when enabled.

## Next Continuation Checkpoint

Resume from the Kodi build protocol with no new product discovery.

Immediate next task:

1. Continue shaping the working prototype around real usage: clean onboarding, Google Maps core, live Kodi chat, Places/Routes answers, Waze links, and participant invite flow.
2. Keep OAuth and write-back disabled until a proven, permissioned Google account path exists.
3. Add persistent trip-account, invite-token, and usage-pool fields before real paid multi-family usage.
4. Add rate limits, quotas, caching, monitoring, queues, and load tests before claiming support for hundreds or thousands of concurrent users.
5. Plan a safe internal rename migration from legacy single-trip route names to canonical trip-account route names, keeping backward-compatible aliases during the transition.

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
