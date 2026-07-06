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
- Group destination and group route state as backend capabilities, not as default visible trip context.
- One owner-managed trip usage pool, so family members do not need separate paid AI subscriptions.

Product-heart decision: the primary experience is Kodi + map + trip points + at least the manager's live location. Group member locations, external app shortcuts, participant management, usage visibility, and admin tools are important, but they should not crowd the first-run path.

Shared-media product decision: group trip photos are a planned extension after the core map/chat/Kodi flow is stable. Participants should eventually be able to take or upload photos through the app into a shared trip gallery, with Kodi able to use safe metadata such as uploader, time, approved location, and nearest trip point. This belongs behind the menu first and must not crowd the primary chat/map experience.

Message-notification product decision: Kodi should eventually support WhatsApp/Telegram-style mobile notifications for new group messages. This requires true Web Push/PWA infrastructure, not only an in-app badge. Notifications are opt-in per participant device, exclude the sender, avoid sensitive lock-screen details, and depend on browser/device support.

Product-language decision: Kodi should not present a trial mode to users. The product starts with a real trip account setup: manager account, Google trip source, manager location, invite link, and participant permissions. Any remaining legacy endpoint/model names are internal technical identifiers until a rename migration is completed.

Map architecture correction: Google Maps is the product map engine. Kodi does not recreate Google Maps behaviors; it adds the agent/group/trip layer on top of Google Maps and uses fallback rendering only when a browser-visible Google Maps key is not configured.

Agent map-context correction: every web chat request to Kodi now sends the current app Google Maps layer as `tripState`: visible trip points, members, consented live/current location, selected place, group route/destination state, and Google source metadata. Kodi must use that app map context before saying it lacks map access. Private Google account sync/write-back is still a separate OAuth-gated capability, but that must not stop Kodi from acting on the map state already loaded in the app.
Public smoke passed on 2026-07-06 after the agent map-context correction: `/api/health`, `/api/trips/demo/storage`, and `/api/trips/demo/google-source` returned OK; public Kodi agent regression passed with OpenAI ready for presence, live-location, trip-character, current-location, and guide questions. One lodging-order prompt fell back to rules after an OpenAI error and remains a follow-up quality hardening item.

Google Maps startup sync correction: the app now calls `/api/trips/demo/google-source/sync` automatically on open/refresh before normal trip rendering. The sync response refreshes setup state, Google source metadata, trip points, members, route/destination state, and clears the agent trip-state cache so Kodi starts each session from the latest app map layer.
Public smoke passed on 2026-07-07 after startup sync deploy: `/api/health` and `/api/trips/demo/google-source` returned OK, and `POST /api/trips/demo/google-source/sync` returned `automatic=true`, `trigger=app_startup`, `sourceRegistered=true`, `syncMode=read_only_fixture`, and 107 trip points in the refreshed trip state.

Location architecture correction: product-wise, Kodi is connected to the Google Maps context. The app should feel like normal Google Maps with Kodi over it. Implementation-wise, the browser still requires device/location permission before the app can use the user's live location; Kodi cannot silently inherit private live location from the user's Google Maps app or account.

Trip-order correction: the default current trip target is derived from the ordered Google Maps trip points, not from a stale stored group destination. Group destination/route controls must be explicit admin actions and must not appear as a default block in the hamburger.

Trip-list UX correction: the hamburger trip list is intentionally coarse. It defaults to `המסלול שלנו` and exposes only `קרוב אלינו`, `הכל`, `מקומות לינה`, and `אטרקציות`; finer grouping should be handled conversationally by Kodi instead of adding more visible filters.

Hamburger place-card correction: the per-place `מפה` action opens the selected point in original Google Maps instead of only focusing Kodi's internal map layer.
Public smoke passed on 2026-07-02 after the hamburger map-link correction: Render serves `index-DA3bIRsr.js`, `/api/health` returns OK, and `/api/navigation/links` returns a valid `googleMaps` URL for a sample trip point.

Route-management direction: each trip point can be removed from the visible route on the current device. Kodi should be allowed, with manager approval, to help manage the route itself: suggest removals, add places, and reorder points according to the actual trip flow. The durable group-level version of those actions still needs a server-backed route editing endpoint before it becomes the shared source of truth.

Voice/chat UX correction: the bottom composer follows a messaging-app mental model. The microphone is for push-to-talk voice messages: press and hold to record, release to send. Continuous voice conversation is a separate, explicitly labeled `שיחה קולית` control and must not appear as an unexplained radio/wifi-style icon or replace text input.

Map-points correction: the top Google map must show all coordinate-backed trip points from the active trip map. Nearby sorting and coarse filters belong to the hamburger trip list, not to the main map layer.
Public smoke passed on 2026-07-03 after the voice/map UX correction: Render serves `index-hj1Oi-HQ.js`, `/api/health` returns OK, and `/api/config/maps` reports Google Maps configured without exposing secrets in source code.

## Current Core

Implemented locally:

- React + TypeScript web app.
- Node + Express API.
- Trip state with 107 imported places after removing a stale `Averof 12` stop that was not part of the intended live trip flow.
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
- Participant welcome flow added on 2026-07-03: when a new participant joins, the backend creates a real Kodi chat message welcoming them by name to the trip group, so joining feels like entering the shared WhatsApp-style conversation rather than only updating a member list.
- Public smoke passed on 2026-07-03 after the participant welcome flow: Render serves `index-D6KDpAwS.js`, the public bundle includes the new join `welcomeMessage` handling, `/api/health` returns OK, and `/api/trips/demo/members` safely rejects an invalid one-letter join request with 400 without polluting the real group chat.
- Mobile main-screen cleanup added: the app no longer seeds invented family chat examples, filters retired seeded chat rows from storage, and keeps participant invite, usage, shortcuts, and GPS management behind the hamburger menu on mobile.
- Default map focus now uses the manager's live GPS location: the map prioritizes trip points within a 40 km radius and falls back to the nearest points if none are inside that radius.
- Mobile core UX correction added on 2026-07-01: the chat is now prioritized over the map on phones, Google Maps defaults to a local 40 km context instead of fitting the whole trip, and the main map surface exposes a clear Google Maps handoff button for the full native map experience.
- Current-location access improved on 2026-07-01: the map top bar now exposes a visible "מיקום נוכחי" action, so live location is not hidden inside the hamburger or secondary map layer.
- Google Maps walking shortcut added on 2026-07-01: selected trip points can now open Google Maps in walking mode, keeping compass and turn-by-turn walking guidance inside Google Maps instead of recreating it in Kodi.
- Public smoke passed on 2026-07-01 after the Google Maps walking shortcut deploy: `/api/health` and `/api/navigation/links` confirmed `googleMapsWalking` with `travelmode=walking` on Render.
- WhatsApp-style chat containment added on 2026-07-01: the group conversation now owns its own internal scroll area, auto-scrolls to the latest message, and keeps the message composer visible instead of stretching the whole page.
- Public smoke passed on 2026-07-01 after the WhatsApp-style chat deploy: the Render CSS bundle includes fixed viewport sizing, contained message scrolling, and mobile safe-area composer spacing.
- Chat scroll and speaker fix added on 2026-07-01: message sync no longer forces repeated scroll jumps while the user reads older messages, and Kodi speaker taps now immediately enter speaking state before the browser speech event fires.
- Public smoke passed on 2026-07-01 after the chat scroll/speaker fix: Render serves the updated JS bundle with contained message scrolling and `speechSynthesis.resume()` for speaker taps.
- Chat stability correction added on 2026-07-02: incoming SSE/polling message refreshes now merge into the local conversation instead of replacing pending messages, and the mobile composer is sticky at the bottom of the contained chat surface.
- Kodi hard-coded presence path removed on 2026-07-06: the former canned "אני כאן" response path was retired. Calls such as "קודי?" and normal trip chat now enter the agent harness instead of receiving a canned presence response.
- Kodi default conversation routing corrected on 2026-07-06: the web chat no longer limits Kodi to explicit wake-word messages. Normal trip/group messages are routed to the agent by default so Kodi can reason from context, while direct participant-to-participant messages such as "מה קורה אורייה" remain group chat only.
- Chat history loading correction added on 2026-07-02: Supabase chat reads now fetch the latest 80 messages and then render them in natural chronological order, so reopening the app does not drift back to an older slice of the group conversation as the chat grows.
- Kodi plain-text correction added on 2026-07-02: Kodi is instructed to answer in plain chat text without Markdown, and both the API and web display remove leftover bold/decorative asterisks from agent replies and already-stored messages.
- Kodi wake-up correction added on 2026-07-02: natural travel questions and tasks now wake Kodi even when the user does not explicitly type "קודי", so normal one-on-one trip conversation does not appear disconnected after ordinary questions such as binoculars, snorkeling, cash, lodging, Waze, or route planning.
- Current-location answer hardening added on 2026-07-01: "איפה אני עכשיו" now routes through Google reverse geocoding and nearby Places context, prefers the requesting member's live GPS over demo/member order, and avoids map viewport re-centering on every live update.
- Current-location replies were made deterministic on 2026-07-01: "איפה אני עכשיו" no longer lets OpenAI rewrite the answer, so Kodi answers directly from Google reverse geocoding / nearby Places and the requesting member's live GPS.
- Public smoke passed on 2026-07-01 for current-location safety: Render now skips OpenAI for "איפה אני עכשיו", uses the requesting member's live GPS, and filters out far-away Places matches; Google reverse geocoding still needs to return a precise human address/name from the configured Maps key.
- Mobile chat visual cleanup added on 2026-07-01: the group header is now a compact one-line bar to preserve chat space, and the chat palette moved toward blue/turquoise without requiring Figma for this targeted fix.
- Entry cleanup added: a new browser no longer skips onboarding because of the shared backend setup state, seeded demo participant names are normalized out of the UI, and secondary map/card layers are hidden on mobile until the user reaches the core experience.
- Kodi elite-agent hardening added on 2026-07-01: the OpenAI bridge now frames Kodi as a capable travel agent, not a narrow search bot, with imported Google trip places, lodging timeline, manager/member location, recent group chat, Places/Routes context, and the known Athens -> Northern Greece/Tzoumerka -> Zagori -> Pelion -> Athens trip arc.
- Live-research trigger added for questions about weather, sunset, cash, food budget, exchange/ATM/euro availability, accessibility, road access, parking, opening hours, and recent conditions. Kodi can use the OpenAI Responses web-search tool when enabled, and retries without the tool if hosted search is unavailable so the chat does not fail.
- Voice input added to the group chat composer through browser speech recognition in Hebrew, exposed as a clean microphone button next to the message box.
- Voice input recording feedback improved on 2026-07-01: while the microphone is active, the composer shows a clear recording status with a pulsing red dot and a pulsing microphone button.
- Voice input UX corrected on 2026-07-02: the microphone now follows the WhatsApp-style model, where pressing and holding records and releasing stops recognition and sends the transcribed message into the shared Kodi chat.
- Continuous voice conversation added on 2026-07-03: the chat composer now includes a clear `שיחה קולית` mode. In this mode the user speaks to Kodi, the spoken text is sent as a chat message, Kodi is forced to answer, the answer is spoken aloud, and listening resumes after Kodi finishes speaking while the mode remains active.
- Server-backed participant management added on 2026-07-03: the invite flow now creates a real member through the API instead of only local browser state, participants join with name and optional age/age group without Render/Google/OpenAI/Supabase credentials, non-owner participants can leave the group from the hamburger menu, and owner/admin users can remove participants. The hamburger also exposes an owner-facing trip-map switch request so Kodi can help move the group from one Google Maps trip source to another, while full private account map listing still requires future Google OAuth.
- Participant duplicate-join correction added on 2026-07-03: repeated invite opens with the same normalized display name now return the existing member instead of creating another group participant or another Kodi welcome message. The live group was cleaned so duplicate exact-name entries for Oriah were removed while one entry per distinct name was kept.
- Admin-gated Google Maps source switching added on 2026-07-03: the hamburger map switch is now a real backend action through `/api/trips/demo/google-source/switch` instead of a chat draft. The server checks the stored actor permissions, blocks non-admin members, saves the new active Google Maps source, and reports zero imported points for unknown/new links until OAuth or another approved import path supplies the actual points.
- Public smoke passed on 2026-07-03 after admin-gated Google Maps source switching deploy: `/api/health` and `/api/trips/demo/setup` returned OK, `/api/trips/demo/google-source/switch` returned 403 for a non-admin participant, and the owner path safely re-saved the existing active source `צפון יוון 2026` with 108 imported points.
- Installed/PWA entry correction added on 2026-07-03: the home-screen shortcut no longer depends on local browser setup state before showing the core map/chat when the backend setup is already complete. The service worker now avoids caching the HTML app shell, requests updates on load, and keeps mobile standalone composer sizing explicit so the chat input remains visible.
- Public smoke passed on 2026-07-03 after the installed/PWA entry correction: Render serves `sw.js` with `kodi-travel-companion-v2`, navigation is network-first, `/` is not cached as the app shell, and a clean-storage mobile Edge smoke reached the core chat with visible composer input, send button, and voice button.
- Message notification V1 added on 2026-07-03: the app now has a hamburger `התראות הודעות` control, checks browser Push support, fetches server Web Push readiness, requests notification permission only after user action, registers a Push subscription when a VAPID public key is configured, and the Service Worker can display/click-open push notifications. Full background delivery to all participants still requires Render VAPID keys and the later Web Push sender/delivery worker.
- Public smoke passed on 2026-07-03 after message notification V1: Render serves `index-CEzxAg4P.js`, `/api/health` returns OK, `/api/trips/demo/notifications/config` returns `status=not_configured` until VAPID keys are configured, the public bundle includes `notifications-menu`, and `sw.js` includes `showNotification`.
- Message notification V2 backend sender added on 2026-07-03: API now uses `web-push`, requires both `VAPID_PUBLIC_KEY` and backend-only `VAPID_PRIVATE_KEY`, stores subscriptions/preferences/delivery audit in Supabase when active with local fallback for development, excludes the sender from chat notifications, revokes expired subscriptions on 404/410, and triggers push delivery after new member/Kodi chat messages. Focused local smoke passed: `/api/health` OK, notification config `not_configured` without VAPID, registration blocked with 409, and chat message append still returns 200.
- Public smoke passed on 2026-07-03 after notification V2 deploy: `/api/health` returns OK, `/api/trips/demo/notifications/config` returns `status=not_configured` until VAPID keys are configured, `sw.js` still includes `showNotification`, and public subscription registration is correctly blocked with 409 while Web Push is not configured.
- Notification VAPID operational helper added on 2026-07-03: `pnpm notifications:vapid` now generates a fresh Render variable block for `VAPID_PUBLIC_KEY`, backend-only `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`; deployment docs and QA now guard this path so notification activation does not depend on ad hoc key instructions.
- Public smoke passed on 2026-07-03 after server-backed participant management deploy: Render serves `index-BA80CIoC.js`, the public bundle includes `members-menu` and `trip-map-source-menu`, `/api/health` returns OK, and `/api/trips/demo/members` successfully created then removed a temporary participant through the owner/admin path.
- Voice conversation composer correction added on 2026-07-03: the continuous voice conversation control is now a compact composer button instead of a full-width row that displaces typing, push-to-talk, and send. Public smoke passed after deploy: Render serves `index-teYS4t8r.css` and `index-CFtMIwAt.js`, and the public CSS includes the compact four-column composer plus `.composer .voice-conversation-toggle`.
- Composer overlap correction added on 2026-07-03: the chat composer now uses explicit CSS grid areas for `conversation`, `recording`, `send`, `mic`, and `text` so voice conversation, push-to-talk, send, and the text input cannot cover each other on RTL mobile screens. Local mobile browser QA at 393px width confirmed zero overlap between conversation, input, mic, and send controls.
- Kodi route-diagram correction added on 2026-07-03: route map / route diagram requests now use a deterministic trip-point answer instead of letting the agent dodge or overwrite the task. Kodi builds a text route diagram from the saved Google-imported trip points, follows the Athens -> north/Greece bridge corridor -> Arta/Tzoumerka -> Zagori -> Pelion -> Athens arc, and includes a Google Maps directions link when coordinates exist.
- Public smoke passed on 2026-07-03 after the route-diagram correction: `/api/health` returned OK and `/api/agent/message` for "Kodi build a route map diagram of the trip" returned `intent=route_creation`, `source=rules`, the Athens -> north/Greece bridge corridor -> Arta/Tzoumerka -> Zagori -> Pelion -> Athens arc, and a Google Maps directions URL.
- Public smoke passed on 2026-07-02 after the press-to-send voice input deploy: Render serves `index-BYYdc0HX.js` and `index-GQis9-mF.css`, `/api/health` returns OK, and the public CSS bundle includes the voice button, recording indicator, and `touch-action` guard used by the hold-to-record control.
- Voice/chat feedback improved on 2026-07-02: starting a voice recording and sending the transcribed voice message now play short WhatsApp-style tones, and the chat shows a blue/turquoise Kodi thinking pulse while the agent is preparing a reply.
- Public smoke passed on 2026-07-02 after the voice/chat feedback deploy: Render serves `index-CJn6zWS7.js` and `index-CkRz3y0Q.css`, `/api/health` returns OK, and the public CSS bundle includes `kodi-thinking-pulse`, the pulse keyframes, and the blue/turquoise palette tokens.
- Voice output added on 2026-07-01: Kodi messages now include a compact speaker control, and requests that include "בקול" or similar wording can trigger Hebrew speech synthesis for the agent reply.
- Rules fallback improved for cash/exchange questions, so even without local OpenAI configuration Kodi gives cautious travel-agent guidance instead of a generic response.
- Kodi fast-answer lane added on 2026-07-01: simple lodging + nearby food/taverna questions now resolve from the trip timeline and saved Google trip-map points before invoking the full OpenAI agent or live Places search, with `latencyMs` telemetry, a very short trip-state cache for active chat bursts, and a Places timeout for live lookups.
- Kodi response-time guard added on 2026-07-01: the full OpenAI agent now has a configurable server-side timeout (`OPENAI_AGENT_TIMEOUT_MS`; originally 8 seconds, later raised for real agent behavior). If the full reasoning/web-search path is too slow, Kodi falls back to the grounded rules/trip answer instead of leaving the chat waiting 45-60 seconds.
- Kodi agent architecture correction added on 2026-07-01: the rules path is now treated as a safety fallback, not Kodi's main intelligence. Normal chat defaults to the faster `OPENAI_AGENT_FAST_MODEL` (`gpt-5.4-mini` by default), deeper/live-research questions use `OPENAI_AGENT_REASONING_MODEL`/`OPENAI_AGENT_MODEL`, the default agent budget moved to 18 seconds, and the fallback no longer feeds a long stale rules answer back into the OpenAI prompt. Follow-up answers such as "מאריתה" now carry the previous member question into trip/route resolution so stale destinations such as `Averof 12` do not override the live conversation.
- Here-and-now mode added on 2026-07-01: when the user asks about here, near me, current location, or a live trip outside the planned itinerary, Kodi uses the requesting device's live location as the active anchor and keeps the saved trip only as background context.
- Chat navigation links fixed on 2026-07-01: Waze and Google Maps URLs inside Kodi/group chat messages now render as tappable links instead of plain text, with QA coverage and a focused browser smoke for the Waze path.
- PWA home-screen shortcut foundation added on 2026-07-01: the web app now includes a manifest, standalone display mode, Kodi app icons, Apple touch icon metadata, and a production service worker so users can add Kodi to the phone home screen like an app.
- Public mobile smoke on 2026-06-30 passed after entry cleanup: a clean browser lands on onboarding, does not render the main app shell, and does not show seeded demo members or map/card layers before setup.
- Public smoke on 2026-06-30 passed after manager-location map focus deploy: `/api/health`, `/api/trips/demo/storage`, and the public app shell returned successfully.
- Public smoke on 2026-06-30 passed after mobile cleanup deploy: `/api/health`, `/api/trips/demo/storage`, and `/api/trips/demo/messages` returned successfully, with retired seeded family-dialogue messages hidden from the public API.
- Public smoke on 2026-07-01 passed after chat navigation deploy: `/api/health`, public bundle inspection, and public browser smoke confirmed Waze URLs inside chat render as tappable links.
- Public smoke on 2026-07-01 passed after PWA shortcut deploy: `/manifest.webmanifest`, `/sw.js`, `/icons/kodi-192.png`, and `/icons/kodi-512.png` returned successfully; manifest reports `display=standalone` and three install icons.
- Public smoke on 2026-07-01 passed after voice-output deploy: `/api/health`, public app shell, and public bundle inspection confirmed `SpeechSynthesisUtterance`, Hebrew `he-IL`, and the Kodi speaker control are deployed.
- Public smoke on 2026-07-01 passed after voice-recording feedback deploy: public bundle inspection confirmed the recording status indicator, red pulse dot, and microphone listening animation are deployed.
- Public smoke on 2026-07-01 passed after current-location action deploy: public bundle inspection confirmed the top-bar `current-location-button` and active styling are deployed.
- Public smoke on 2026-07-01 passed after the mobile map/chat and Kodi response-time deploy: public bundle includes the direct Google Maps handoff and mobile chat-priority layout; `/api/navigation/links` returned 200; `/api/agent/message` returned within the enforced timeout ceiling with observed runtime latency of about 8 seconds.

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
- Web Push for future mobile group-message notifications, backed by server-side subscription storage and VAPID keys.
- Supabase Storage for future shared trip photo files, with PostgreSQL metadata and backend-issued signed access.

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
- Mobile push notifications need `push_subscriptions`, `notification_preferences`, `notification_deliveries`, Service Worker push handling, and backend-only `VAPID_PRIVATE_KEY` before the app can claim WhatsApp-like background notifications.
- Shared trip photos should be stored in Supabase Storage, not Render disk, with group-private access and metadata in a future `trip_photos` table.

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
- Kodi conversation routing correction updated on `2026-07-06`; Kodi is no longer limited to explicit wake-word messages. Normal trip/group messages route to the agent by default, while direct participant-to-participant messages such as "מה קורה אורייה" stay inside the group chat.
- Hebrew Kodi agent master specification added on `2026-07-05` in `docs/KODI_AGENT_MASTER_SPEC_HE.md`; it consolidates the agent identity, Google Maps-first knowledge model, conversation routing, here-and-now behavior, trip timeline intelligence, pragmatic Google Maps/Waze actions, voice expectations, failure modes, and mandatory agent QA scenarios. Future Kodi prompt/code changes should be checked against this document before implementation.
- Kodi location/action enforcement added on `2026-07-05`; location-dependent Kodi messages now try to refresh the browser's current location before calling the agent, and the API appends Google Maps/Waze action URLs to place/route recommendations when a target coordinate or Google Maps URI is available. The OpenAI prompt also explicitly requires fresh location context and action links for concrete place recommendations.
- Kodi elite-agent upgrade added on `2026-07-01`; the OpenAI bridge now frames Kodi as an elite travel companion, not a narrow bot. Kodi receives the imported Google trip places, lodging timeline, visible member location, recent chat, route/Places context, and the known Athens -> Northern Greece/Tzoumerka -> Zagori -> Pelion -> Athens arc. For live questions such as weather, sunset, cash budget, food budget, road access, parking, opening hours, and accessibility, Kodi can use the Responses API web-search tool from the backend when enabled.
- Mobile chat visual cleanup added on `2026-07-01`; the group header is now a compact one-line bar to preserve chat space, the palette moved toward blue/turquoise, and public Render smoke confirmed the deployed CSS asset `assets/index-CCnJ65eT.css` contains the compact mobile header and updated palette.
- Current-location answer hardening added on `2026-07-01`; Kodi now prefers Google-readable place names from reverse geocoding or nearby Places search, attaches browser-provided live location to the manager even when the incoming member id is not an exact stored id, prefers fresh GPS context over stale trip member locations, refreshes device GPS before current-location questions from the web client, and no longer exposes raw coordinates in the fallback answer.
- Public smoke passed on `2026-07-01` for current-location hardening: Render served the fresh-GPS web asset `assets/index-lUIkzl8I.js`, and the public API no longer exposed raw coordinates or stale Greece context for the tested current-location request.
- Install and menu simplification added on `2026-07-01`; the hamburger now exposes a clear in-app home-screen install action, a simple invite link, and a direct per-device location action, while heavy management surfaces such as full trip places, shortcuts, activity, and usage are collapsed under advanced options. Participant join remains name-first, with age optional and location granted separately on the participant device.
- WhatsApp-style invitation decision and implementation added on `2026-07-01`; WhatsApp is now defined as the UX model and sharing channel, not the product source of truth. The manager can share the trip invite through the phone's native share sheet, with copy-link fallback. Participants still join through Kodi, enter their own name, and approve location on their own device.
- Kodi voice personality decision added on `2026-07-01`; the target is a natural GPT-style Hebrew voice that feels like a friendly travel partner. The voice path should stay close to OpenAI's neutral/default TTS behavior instead of forcing a slow, low, or overly styled persona.
- Natural Kodi speech endpoint added on `2026-07-01`; `/api/agent/speech` now creates server-side OpenAI speech audio with `gpt-4o-mini-tts` by default, configurable voice/instructions, owner-managed usage gating, and no browser-side OpenAI key exposure. The web client now tries this endpoint first and falls back to browser speech only if server voice is unavailable.
- Kodi voice default corrected on `2026-07-01`: default TTS voice is now `alloy`, speed is `1.0`, custom speech instructions are opt-in through `OPENAI_TTS_INSTRUCTIONS`, and browser fallback uses neutral rate/pitch instead of forced slow/low speech.
- Public smoke passed on `2026-07-01` for install/menu simplification: Render served `assets/index-DvgYdZio.js` and `assets/index-CCIm6WMe.css`, including the install prompt path and collapsed advanced menu styles.
- Public smoke passed on `2026-07-01` for WhatsApp-style invite sharing: Render served `assets/index-J6xKOAk0.js` and `assets/index-C-AMusoS.css`, including `navigator.share` and the `whatsapp-style-share-link` invite model.
- Public smoke passed on `2026-07-01` for Kodi browser-voice fallback tuning: Render served `assets/index-CwyqiGym.js`, including browser voice enumeration, Hebrew `he-IL`, male Hebrew voice hints, and fallback speech output. This remains a fallback, not the final GPT-style neural voice target.
- Public smoke passed on `2026-07-01` for natural Kodi speech: Render served `assets/index-DmO31BYO.js` with `/api/agent/speech` client playback, and the public `/api/agent/speech` endpoint returned `200 OK`, `audio/mpeg`, `X-Kodi-Voice-Model: gpt-4o-mini-tts`, and `X-Kodi-Voice: echo` for a short Hebrew Kodi voice sample.
- Public smoke passed on `2026-07-01` for the Kodi agent-first context correction: a follow-up answer of "מאריתה" after an Athens airport / first-hotel question resolved the named first-night lodging instead of stale `Averof 12`, Google Routes returned `ready`, OpenAI returned `source=openai` with `openAiModel=gpt-5.4-mini`, `fallbackUsed=false`, and observed latency was about 6.9 seconds.
- Kodi app branding selected on `2026-07-02`: the home-screen/share identity is the blue compass `K` icon with a small turquoise sparkle, preserving the name `קודי` as the app shortcut while using `Kodi AI Smart Guide` for full title/share metadata.
- Render build recovery added on `2026-07-05`: production packaging was aligned with the live Render npm dashboard path after deploys failed on npm workspace/install help. Kodi now keeps `package-lock.json`, removes the pnpm production lockfile, builds through `node scripts/build.mjs`, starts through `node apps/api/dist/server.js`, and QA guards the npm-compatible Render path.
- Public smoke passed on `2026-07-05` after the Render build recovery: Render served `assets/index-DWXlSwt1.css` and `assets/index-CX0FO_xk.js`, `/api/health` and `/api/trips/demo/storage` returned successfully, the deployed CSS contains the mobile composer grid fix, and duplicate joining as `אורייה` returned `existingMember=true` without creating another participant row.
- Kodi agent specification consolidated on `2026-07-05`: `docs/KODI_AGENT_SPEC.md` now defines Kodi as the intelligent Hebrew travel companion, not a FAQ bot; it captures Google Maps as the map engine, here-and-now behavior, trip timeline intelligence, permission boundaries, voice expectations, failure behavior, speed principles, and required QA scenarios for future agent improvements.

## Next Continuation Checkpoint

- Kodi conversation-personality correction added on `2026-07-02`: rigid fallback phrases such as "I heard the trip manager", "from the conversation I identify", and generic admin-approval endings were removed from the API/web fallback paths. The OpenAI prompt now explicitly forbids copying fallback wording, and QA/smoke checks protect Kodi's role as a natural intelligent travel companion. Admin approval is reserved for explicit operational map/group changes, not ordinary questions.
- Kodi Places-answer latency guard added on `2026-07-02`: when Google Places already returns relevant service/place results, Kodi now prefers a fast agent answer over automatic web-search/reasoning escalation. This keeps common questions such as boats, restaurants, beaches, fuel, ice cream, and bathrooms conversational instead of waiting on heavy research.
- Public smoke passed on `2026-07-02` for the Kodi conversation/personality and Places latency correction: a Pelion boat-rental question returned `source=openai`, `openAiStatus=ready`, `openAiModel=gpt-5.4-mini`, `fallbackUsed=false`, no rigid manager/listening/admin boilerplate, no stale `Averof 12`, and a practical answer with estimated rental ranges and safety checks.
- Kodi agent-first runtime correction added on `2026-07-02`: rules and fast-lane replies are now fallback/opt-in safeguards instead of the default brain. Current-location questions reach the OpenAI agent after reverse geocoding, the fast trip answer is disabled unless `KODI_FAST_TRIP_ANSWER_ENABLED=true`, Kodi receives a larger recent-chat window, and the prompt now explicitly prevents status-panel/API-wrapper replies. This restores Kodi's intended role as the intelligent travel companion over Google Maps and trip context.
- Public smoke passed on `2026-07-02` for the agent-first runtime correction: current-location requests now return `source=openai`, `openAiStatus=ready`, `fallbackUsed=false`, and no fast lane; a Rio-Antirrio bridge guide question returned an OpenAI/web-search grounded answer tied to the Athens -> Northern Greece route context.
- Kodi response-time architecture correction added on `2026-07-02`: ordinary trip conversation now defaults to the fast OpenAI agent model, reasoning-model escalation is opt-in through `KODI_REASONING_MODEL_ENABLED=true`, web search is gated to genuinely fresh/live data needs, agent timeout is tightened, response size and place-note payload are capped, and the browser sends a larger recent-chat window without automatically attaching a stale selected map point. This fixes the failure mode where Kodi waited around 20 seconds, then fell back to a rigid clarification instead of answering like an intelligent travel companion.
- Kodi route-follow-up correction added on `2026-07-02`: route safety/timing follow-ups about bridges, darkness, risk, or mountains are now bundled with the preceding user travel question before agent reasoning. This prevents Kodi from treating "will we reach the bridge before dark?" as a new isolated question after the user already established "Athens airport -> first hotel / Marathia".
- Public smoke passed on `2026-07-02` for the Kodi response-time and route-follow-up correction: the Athens airport -> Hotel Marathia / Rio-Antirrio bridge follow-up returned `source=openai`, `openAiStatus=ready`, `openAiModel=gpt-5.4-mini`, `fallbackUsed=false`, runtime about 9.7 seconds, and preserved the intended route context instead of falling back to a rigid clarification or treating the bridge as an unrelated isolated query.
- Kodi speech pace correction added on `2026-07-02`: OpenAI TTS now defaults to `OPENAI_TTS_SPEED=1.16` when not explicitly configured, browser fallback speech uses rate `1.14`, and `/api/agent/speech` exposes `X-Kodi-Voice-Speed` for public smoke checks. This keeps Kodi's voice warmer and less sluggish without making Hebrew playback feel rushed.
- Public smoke passed on `2026-07-02` for the Kodi speech pace correction: Render serves web bundle `index-C103Z4RT.js`, `/api/agent/speech` returned `200 OK`, `audio/mpeg`, `X-Kodi-Voice-Model: gpt-4o-mini-tts`, `X-Kodi-Voice: alloy`, and `X-Kodi-Voice-Speed: 1.16`.
- Kodi read-aloud UX correction added on `2026-07-02`: read-aloud now starts immediately through browser speech instead of waiting for server MP3 generation, the manual control is a clear `הקרא` / `עוצר` button with an active pulse state, and voice-intent detection covers more natural Hebrew phrases such as `תקריא לי`, `בדיבור`, `בקול רם`, and `אני רוצה לשמוע`.
- Public smoke passed on `2026-07-02` for the immediate read-aloud UX correction: Render serves `index-BJMZgb7X.js` and `index-5wfyTwaN.css`; the public JS bundle contains `הקרא`, `SpeechSynthesisUtterance`, and `תקריא לי`, and the public CSS bundle contains `speak-message-button.speaking`, `speakButtonPulse`, and the wider readable speak button sizing.
- Kodi read-aloud quality correction added on `2026-07-02`: immediate browser speech is no longer the default playback path because mobile/browser Hebrew voices can sound feminine, robotic, and context-blind. Kodi now defaults to server-side OpenAI TTS with `echo`, default male Hebrew guide instructions, speech-audio prefetch/cache when a Kodi answer arrives, and a visible `מכין` button state while high-quality audio is being prepared.
- Public smoke passed on `2026-07-02` for the read-aloud quality correction: Render serves `index-BnqQgjRL.js` and `index-Cz-ksYlR.css`; public JS contains the `מכין` state and `/api/agent/speech`, public CSS contains `speak-message-button.preparing` and `speakButtonPulse`, and `/api/agent/speech` returned `200 OK`, `audio/mpeg`, `X-Kodi-Voice: echo`, `X-Kodi-Voice-Speed: 1.16`.

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
