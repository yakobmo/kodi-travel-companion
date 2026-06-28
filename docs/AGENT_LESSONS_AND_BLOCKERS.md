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

Kodi is past visual-only MVP.

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
- The old `demo_storage_states` JSON bridge is legacy only.
- Next major target is Realtime/event flow, not more mock UI.

## Recurring Blockers And Fixes

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

- Keep `demo_storage_states` only as legacy compatibility until a cleanup migration.
- Do not use it in runtime code.
- QA must fail if runtime storage reads or writes `demo_storage_states`.
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
- smoke `/api/trips/demo/storage`
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
