# AI Travel Companion MVP

Hebrew-first AI travel companion for a family/group trip.

The product combines:

- Live trip map.
- Google Maps Place List import.
- At least the trip manager's consented live location as a core context anchor.
- WhatsApp-style group conversation.
- Kodi, the AI companion, as a participant in the family trip chat.
- Waze / Google Maps navigation actions.
- External app shortcuts such as Booking, Airbnb, Waze, and Google Maps.
- Live group map with participant locations, only with explicit consent.
- Group permissions: everyone can talk, only admins can change the trip.
- A shared trip usage pool: participants do not need separate paid AI subscriptions.

## Current Stage

This is the deployed MVP Core.

The app currently has:

- API endpoint for the imported demo trip places.
- 108 places loaded from the Google Maps place-list spike fixture.
- Navigation endpoint that creates Waze and Google Maps links.
- React UI connected to the local API.
- Hebrew map/chat shell with a Waze action card.
- Render deployment.
- Supabase production project.
- Relational Supabase storage for messages, members, live locations, group destination, group routes, and setup state.

External Google APIs, OpenAI, and real auth are still future steps.

The current web map uses an internal fallback layer that connects trip places, personal GPS, selected destination, and consented group locations. To prepare the Google Maps JS switch, configure:

```text
VITE_GOOGLE_MAPS_API_KEY=
```

Do not put private server-only secrets in `VITE_*` variables. Browser-visible Google Maps keys must be restricted in Google Cloud.

The live group map is now defined as a flagship product feature. It will be implemented in stages because it requires consent, permissions, users, realtime updates, and careful privacy boundaries.

The product heart is now defined in `docs/CORE_EXPERIENCE_AND_ONBOARDING.md` as: Kodi + live map + trip points + at least the trip manager's live location. Everything else should support that core or stay in a secondary management surface.

Kodi is not a separate support bot or external AI chat. The family has one shared conversation, and Kodi wakes up when addressed, reads the recent context, and responds inside the thread.

Kodi is also not a separate paid AI account per family member. The product model is one shared trip space: the trip owner connects or pays for the required AI/API usage, the backend runs Kodi centrally, and participants use that shared agent according to their permissions.

Kodi also has a planned "create new route" mode. In that mode, Kodi first asks for route constraints such as time, walking difficulty, interests, child suitability, and start/end points before suggesting or adding a route to the app map.

Kodi also has a local guide mode: the family can ask Kodi to explain the place or attraction they are seeing, and Kodi should answer inside the group conversation using location/place context without inventing uncertain facts.

The project also uses a Codex self-review protocol: Codex acts as both builder and QA reviewer, and a change is only considered approved after product, architecture, privacy, UX, and QA gates are checked.

## Planned Stack

- Frontend: React + TypeScript + Vite.
- Backend: Node.js + TypeScript.
- Database: PostgreSQL.
- Map: Google Maps JavaScript API.
- AI: OpenAI via backend only.
- Navigation: Waze deep links with Google Maps fallback.
- Deploy: GitHub + Render.
- Billing/usage: one trip owner or trip usage pool, enforced by the backend.

## Repository Shape

```text
travel-companion-mvp/
  AGENTS.md
  apps/
    api/
    web/
  docs/
  scripts/
```

## MVP Boundaries

In the first MVP:

- One group owner/admin is enough.
- The data model already supports group members.
- One owner-managed usage pool is enough; members should not need individual OpenAI or Google API credentials.
- The chat UX is group-style.
- Kodi knows who is speaking.
- There is no separate "talk to AI" channel.
- Basic external app shortcuts should arrive early.
- Real participant invitations and live group location are planned as staged features.
- No participant location is shown without explicit consent.

## QA

Run local skeleton QA:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/qa.ps1
```

Build the apps:

```powershell
$nodeDir = Join-Path (Get-Location) ".tools\node-v24.14.0-win-x64"
$env:Path = "$nodeDir;$env:Path"
& (Join-Path $nodeDir "npm.cmd") run build --workspace apps/api
& (Join-Path $nodeDir "npm.cmd") run build --workspace apps/web
```

Run the local dev servers:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/dev-api.ps1
powershell -ExecutionPolicy Bypass -File scripts/dev-web.ps1
```

Local URLs:

- Web: `http://127.0.0.1:5173`
- API health: `http://127.0.0.1:3001/api/health`
- Demo places: `http://127.0.0.1:3001/api/trips/demo/places`

Public MVP URL:

- `https://kodi-travel-companion.onrender.com`

## Important Docs

Repository-local docs:

- `AGENTS.md`
- `docs/PROJECT_STATUS.md`
- `docs/ARCHITECTURE_LINKS.md`
- `docs/DEPLOYMENT_PLAN.md`
- `docs/TRIP_OWNERSHIP_AND_USAGE_MODEL.md`
- `docs/SUPABASE_SCHEMA.md`
- `docs/AGENT_LESSONS_AND_BLOCKERS.md`
- `docs/CODEX_REMINDER_COMMANDS.md`
- `.codex/skills/kodi-build-protocol/SKILL.md`

Global Codex reminder:

- `C:\Users\yaako\.codex\skills\kodi-build-protocol\SKILL.md`

The original planning docs in the Codex workspace live one directory above this project:

- `../outputs/ai-travel-companion-product-spec.md`
- `../outputs/live-group-map-and-external-apps-upgrade.md`
- `../outputs/live-group-map-execution-plan.md`
- `../outputs/kodi-group-conversation-model.md`
- `../outputs/kodi-route-creation-mode.md`
- `../outputs/kodi-local-guide-mode.md`
- `../outputs/codex-self-review-approval-protocol.md`
- `../outputs/trip-data-model.md`
- `../outputs/architecture.md`
- `../outputs/ux-wireframe.md`
- `../outputs/project-status-board.md`

These external workspace docs should not be assumed to exist after the project is pushed to a new GitHub repository.
