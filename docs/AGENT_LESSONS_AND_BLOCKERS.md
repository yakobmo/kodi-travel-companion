# Agent Lessons And Blockers

This document records recurring blockers found during Kodi development and the operating decisions that prevent repeating the same loops.

## Purpose

Kodi development should not depend on the user repeatedly copying values, approving obvious next steps, or translating technical ambiguity.

## Startup Reminder Mechanism

The protocol is anchored in three places:

- `AGENTS.md`: short repository-level operating rules to read before touching the project.
- `.codex/skills/kodi-build-protocol/SKILL.md`: repository copy of the reusable Kodi build protocol.
- `C:\Users\yaako\.codex\skills\kodi-build-protocol\SKILL.md`: global Codex skill copy for future sessions.
- `docs/CODEX_REMINDER_COMMANDS.md`: short dashboard-style commands the user can type in chat.

The practical startup rule is:

1. Open `AGENTS.md`.
2. Use `kodi-build-protocol` when continuing Kodi work.
3. Treat the short commands in `docs/CODEX_REMINDER_COMMANDS.md` as user control buttons.
4. Add new recurring blockers to this file.

This is not only documentation. It is the working memory layer for future automation decisions.

The working loop is:

1. Identify the current stage.
2. Name the blocker precisely.
3. Prefer automation over manual user actions.
4. If manual action is unavoidable, ask for one action only.
5. Verify with QA.
6. Record the lesson.
7. Continue only after the state is coherent.

## Current Product Stage

Kodi is past a visual-only prototype.

Implemented:

- Hebrew React/TypeScript app.
- Node/Express API.
- Render deployment.
- GitHub repository.
- Supabase production project.
- Relational storage paths for group messages, members, live locations, destinations, routes, and setup state.
- Local JSON file fallback for development.

Active technical direction:

- Production uses Supabase relational tables.
- The old JSON bridge is legacy only.
- Next major target is Realtime/event flow, not more mock UI.

## Recurring Blockers And Fixes

### 0. Chat History Must Load The Latest Slice

Problem:

Group chat storage can grow beyond the displayed window. If Supabase queries sort ascending and then apply `limit`, the app shows the oldest slice and reopening the app looks like the recent conversation disappeared.

Decision:

- For chat/history windows, fetch the newest rows first from storage.
- Reverse them only after fetching, so the UI still renders natural chronological order.
- Do not replace the visible chat with seed/demo data when a live message fetch fails; show an error state and preserve the current local conversation.
- Kodi answers should be plain chat text, not Markdown. Strip leftover bold/decorative asterisks at the API boundary and at display time for already-stored messages.

### 1. Too Much Manual Copy/Paste

Problem:

The user was asked to copy Supabase URLs, keys, DB passwords, and connection strings through several screens. This created confusion and wasted time.

Decision:

- Ask the user for secrets only when there is no API, CLI, or safe admin endpoint alternative.
- Never ask for several values at once.
- Prefer Render env vars, guarded admin endpoints, and scripts.
- If a value must be pasted, state exactly:
  - where to click
  - which field
  - what kind of value
  - what not to paste

Bad pattern:

```text
Paste the database URL and replace the password.
```

Better pattern:

```text
In Render Environment, paste the full Supabase connection string into SUPABASE_DB_URL.
Use the database password you just reset only inside the [YOUR-PASSWORD] part.
Do not paste the password alone into SUPABASE_DB_URL.
```

### 2. Hidden Assumption: Supabase Means One Thing

Problem:

The word Supabase mixed several separate concerns:

- REST API URL.
- service_role API key.
- Postgres connection string.
- database password.
- relational schema.
- realtime publication.

Decision:

Always name the exact Supabase layer being discussed.

Use this vocabulary:

- `SUPABASE_URL`: project API URL.
- `SUPABASE_SERVICE_ROLE_KEY`: backend-only API key.
- `SUPABASE_DB_URL`: Postgres connection string for migrations/admin operations.
- schema SQL: database tables and RLS.
- realtime: live event subscription layer.

### 3. JSON Bridge Outlived Its Usefulness

Problem:

The initial `demo_storage_states` table was useful to validate production storage quickly, but it became a liability after relational tables existed.

Decision:

- Keep the legacy JSON bridge only as compatibility until a cleanup migration.
- Do not use it in runtime code.
- QA must fail if runtime storage reads or writes the legacy JSON bridge.
- Runtime status should report `relationalTablesReady`, not bridge readiness.

### 4. QA Must Track The Product Spec

Problem:

QA initially checked that the temporary bridge existed. After the product moved forward, QA still protected the old step.

Decision:

Before each implementation step, update QA expectations to the current product architecture.

QA must validate:

- current intended behavior
- no regression of completed behavior
- no continued dependency on retired paths

### 5. User Approval Is Not Technical Validation

Problem:

The user explicitly said their approval is automatic and not a reliable technical review.

Decision:

Codex must self-approve only after evidence:

- build passes
- QA script passes
- local smoke passes when relevant
- public Render smoke passes after deployment
- docs/status are updated

If tests cannot run, the final response must say so clearly.

### 6. One Instruction At A Time For Manual UI Work

Problem:

The user got lost when instructions described several screens or concepts at once.

Decision:

When manual UI work is unavoidable, provide exactly one task.

Format:

```text
Task 1:
Click <label>.

Stop there and send a screenshot.
```

Do not explain the next three tasks in advance unless the user asks.

### 7. Toolchain Path Problems

Problem:

The Windows shell did not recognize `npm` or `python` in some turns.

Decision:

Before declaring a tool unavailable:

- check `node_modules` and repo scripts
- use known bundled runtime paths when available
- avoid turning a PATH problem into a user task

If a tool still cannot run, record:

- exact command
- exact failure
- fallback used

### 8. Deployment Does Not End At Live

Problem:

Render showing "Live" is not enough. The service can be live but functionally wrong.

Decision:

After each deployment:

- smoke `/api/health`
- smoke the trip storage endpoint
- smoke one endpoint touched by the change
- update docs/status with date and result

### 9. Do Not Mix Product Design With Infrastructure Loops

Problem:

Important product insights arrived while infrastructure work was underway: Kodi as WhatsApp-style participant, family group permissions, onboarding, route creation, live group locations.

Decision:

When product insight appears during implementation:

- stop implementation only if the current work would conflict with it
- otherwise record it in product docs/status
- return to the active technical stage

### 10. Live Streams Break Network-Idle UI Tests

Problem:

After adding a long-lived group activity stream, browser smoke tests that waited for `networkidle` timed out. The app was not broken; the test assumed the network should become quiet, which is false when a live stream is intentionally open.

Decision:

- For pages with EventSource/SSE or other live connections, wait for `domcontentloaded` and specific UI markers.
- Add a direct smoke check for the stream endpoint itself.
- Keep polling fallback checks so the UI remains usable if a live stream fails.

### 11. Hebrew Text In Ad-Hoc PowerShell Node Scripts Can Misencode

Problem:

An ad-hoc public browser smoke test looked for Hebrew text written directly inside a PowerShell here-string. The app was correct, but the test timed out because the Hebrew string reached Node with broken encoding.

Decision:

- For ad-hoc Node smoke scripts launched from PowerShell, use Unicode escapes for exact Hebrew assertions.
- When a Hebrew assertion fails unexpectedly, first print the actual UI text and request counters before changing product code.
- Keep repository smoke scripts as files, not pasted shell snippets, when a check becomes permanent.

### 12. Secret Leak Checks Must Distinguish Names From Values

Problem:

A public smoke test for the Google readiness endpoint treated the string `GOOGLE_OAUTH_CLIENT_SECRET` as a leaked secret because the variable name contains `SECRET`. The endpoint was safe; it returned requirement names and booleans only.

Decision:

- Secret smoke tests may allow known environment variable names.
- They must fail when raw credential values, token-shaped fields, or unexpected `value` fields appear.
- For readiness endpoints, assert the response shape: names, purposes, configured booleans, and no raw values.
- Do not treat a safe config key name as a leaked credential.

### 13. Google Maps Key Does Not Enable Every Google API

Problem:

`GOOGLE_MAPS_API_KEY` can be valid for Places while Routes still returns `PERMISSION_DENIED` if `Routes API` is not enabled in the same Google Cloud project.

Decision:

- Treat each Google capability as a separate activation gate.
- Readiness can confirm that the key exists, but live smoke must confirm the specific API works.
- If Google returns `PERMISSION_DENIED`, ask the user for one manual action: enable the named API in Google Cloud.
- Keep endpoint responses credential-safe and report Google status without exposing the key.

### 13. Chat Navigation Must Be Tappable, Not Plain Text

What happened:

Kodi returned a valid Waze URL in the chat, but the mobile UI rendered it as plain text. The user could see the URL but could not tap it.

Why it happened:

The chat component rendered `message.text` directly. Navigation links created inside agent text were not converted into anchors or buttons.

Decision:

- Chat rendering must identify Waze and Google Maps URLs and render them as safe tappable links.
- Use React nodes, not `dangerouslySetInnerHTML`.
- Repository QA must check the link renderer and visible `.message-link` styling.
- Browser smoke for this path should assert `a.message-link.waze-link` with a real Waze `href`.

Current blocker note:

- Full `scripts/smoke-local.mjs` still currently fails before the Waze assertion on the onboarding-to-map transition in local preview.
- The Waze chat fix was verified with a focused browser smoke that sends a Waze URL and confirms the generated anchor.
- Next QA cleanup should make the full smoke independent of fragile Hebrew text and onboarding copy.

## Current Operating Checklist

Before coding:

- State the active stage.
- Check git status.
- Search for existing implementation.
- Identify whether the step is product, backend, frontend, database, deployment, or QA.

During coding:

- Keep changes scoped.
- Prefer existing patterns.
- Do not create new abstractions unless they remove real duplication or risk.
- Avoid relying on retired paths.

Before commit:

- Run build.
- Run `scripts/qa.ps1`.
- Run local smoke if relevant.
- Review `git diff`.

After commit:

- Push to GitHub.
- Wait for Render deploy.
- Run public smoke.
- Update status docs.

## Next Lessons To Add

Add a new entry whenever a blocker repeats twice or costs more than one turn.

Each entry must include:

- What happened.
- Why it happened.
- The decision that prevents it.
- The QA or automation check that enforces it.

### 14. Do Not Let Guardrail Rules Become Kodi's Brain

What happened:

Repeated tactical fixes added rules and fast-lane answers that returned before the OpenAI agent could reason. Kodi then sounded like a limited bot, status panel, or setup wrapper instead of the intelligent travel companion.

Why it happened:

The fallback layer was treated as the primary response path for convenience and latency. That solved narrow cases but damaged the core product promise: Kodi should synthesize Google map context, live location, trip timeline, recent chat, Places/Routes data, and external/web context.

Decision:

- Default runtime is agent-first.
- Rules are fallback, safety grounding, or explicitly enabled fast paths only.
- `KODI_FAST_TRIP_ANSWER_ENABLED` must be explicitly set to `true` before canned fast trip answers can bypass OpenAI.
- Current-location questions should still reach the OpenAI agent after reverse geocoding, with raw coordinates avoided in user-facing copy.
- Prompt updates must preserve Kodi as a warm, capable travel partner, not an API/status explainer.

QA/automation:

- `scripts/qa.ps1` now fails if current-location questions are forced into rules-only replies by the old `!shouldReverseGeocodeCurrentLocation(message) && openAiUsageGate.allowed` gate.

### 15. Template Language Must Not Leak Into Kodi Conversation

What happened:

Kodi answered a natural question about boat rentals in Pelion with rigid fallback phrasing: "I heard the trip manager", "from the conversation I identify", and a generic admin-approval ending. That made Kodi sound like a constrained form bot instead of an intelligent travel companion.

Why it happened:

Fallback rules were written as product scaffolding and permission reminders, then their language leaked into normal chat. The OpenAI prompt also received that fallback as grounding without a strong enough instruction not to imitate it.

Decision:

- Kodi must answer ordinary questions directly and naturally.
- Admin approval is mentioned only for explicit operational write actions: changing group destination, editing the map, creating a shared route, or similar actions.
- Fallback replies may be brief and useful, but must not contain meeting-summary boilerplate or permission endings.
- Trip context such as a stale selected destination must not override a user question about a different region or day.

QA/automation:

- `scripts/qa.ps1` now checks the API fallback and web fallback for banned rigid phrases.
- `scripts/smoke-local.mjs` now asserts Kodi replies avoid the old template language instead of waiting for it.

### 16. Invitation Must Create Server Membership, Not A Local Illusion

What happened:

The product goal is WhatsApp-style joining: the manager sends a link and another family member becomes part of the same trip group. A local-only join flow looks right for one browser but does not create a reliable shared group state.

Why it happened:

Early invite UX focused on reducing onboarding friction and did not immediately promote the participant into the backend member model. That is tempting for prototype speed, but it breaks the real product promise once multiple devices are involved.

Decision:

- Joining through an invite link must call a backend member endpoint.
- Participants should provide only name and optional age/age group.
- Participants must never configure Render, Google Cloud, OpenAI, Supabase, or private provider keys.
- Owner/admin can remove participants; non-owner participants can leave.
- Location sharing remains per-device consent and is not inherited from the manager.

QA/automation:

- `scripts/qa.ps1` checks that the web join flow calls `/api/trips/demo/members`, that remove/leave actions exist, and that the API exposes member create/delete endpoints.

### 17. Installed PWA Entry Must Not Depend On Local Browser State

What happened:

Opening Kodi from the home-screen icon could show a version without the group chat/composer. The installed app path behaved differently from the normal browser path.

Why it happened:

The app initially decided whether to show onboarding from local `localStorage`, while the real setup state already lived on the backend. A fresh installed/PWA context may not have the local flag even when the trip is already configured. The service worker also cached the root HTML shell, which made stale installed-app launches more likely after deploys.

Decision:

- Backend setup state is the source of truth for entering the core map/chat experience.
- The installed app must show the chat/composer when backend setup is complete, even if local storage is empty.
- The service worker must not cache `/` or HTML navigation responses as the app shell.
- PWA updates should request a service-worker update on load and refresh once when the active worker changes.

QA/automation:

- `scripts/qa.ps1` now checks for service-worker update handling, navigation network-first behavior, and rejects caching `/` as the app shell.
- Manual/local smoke should include a clean-storage mobile entry and verify `.composer input` is visible.

### 18. Render Environment Automation Needs A Real Render API Path

What happened:

Kodi needed production Web Push VAPID keys in Render. The app code and Supabase schema were ready, but Render environment variables still required the account owner's dashboard session because no `RENDER_API_KEY` or Render CLI was available locally.

Why it happened:

Generating secrets is automatable; inserting them into a third-party dashboard is not safely automatable without an authenticated API token. Clipboard automation can also fail on Windows desktop sessions, so it cannot be treated as guaranteed.

Decision:

- Do not promise full Render environment automation unless a Render API token or trusted CLI session exists.
- Generate secrets locally into `.data`, which is ignored by Git.
- Commit only repeatable scripts and documentation, never generated secret values.
- Ask the user for one dashboard action only, with exact field names and value source.

QA/automation:

- `scripts/qa.ps1` checks that `pnpm notifications:vapid` exists, generates VAPID variables, and that deployment docs explain the Render setup without committing secrets.
