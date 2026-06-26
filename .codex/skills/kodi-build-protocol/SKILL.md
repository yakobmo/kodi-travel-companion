---
name: kodi-build-protocol
description: Use when continuing Kodi Travel Companion development, deployment, Supabase work, Render/GitHub automation, product-spec alignment, or when the user says to continue the build loop. Also trigger on short user reminder commands such as "פרוטוקול קודי", "קודי פרוטוקול", "קודי QA", "קודי חסמים", "קודי המשך מסודר", "הפעל נוהל קודי", or "תזכורת קודי". Enforces a disciplined cycle of stage identification, blocker removal, implementation, QA, self-review, docs update, commit, deploy, and smoke testing while minimizing manual user copy/paste.
---

# Kodi Build Protocol

## User Reminder Commands

When the user writes one of these short commands, load and follow this protocol before doing any implementation:

- `פרוטוקול קודי`
- `קודי פרוטוקול`
- `תזכורת קודי`
- `הפעל נוהל קודי`
- `קודי המשך מסודר`
- `קודי QA`
- `קודי חסמים`

Treat these commands as dashboard-style controls from the user.

If the command is `קודי QA`, start by reporting the QA gates and then run the relevant checks.

If the command is `קודי חסמים`, start by identifying the blocker, the cause, the automation path, and whether user action is truly required.

If the command is `קודי המשך מסודר`, resume the next implementation step only after reading current status and `git status`.

## Core Rule

Treat user approval as product intent, not technical validation.

Do not continue because the user says "continue"; continue because the current stage is coherent and the previous step has evidence.

## Start Of Turn

1. Identify the active stage in one sentence.
2. Run or inspect `git status` before editing.
3. Search existing code/docs before adding a new file or concept.
4. If interrupted or resumed, verify the newest user request before continuing.

## Manual User Actions

Prefer automation over manual instructions.

Ask the user for manual UI work only when:

- the needed action requires their account session
- no safe CLI/API path exists
- a secret must be created by the user

When manual action is unavoidable:

1. Give one task only.
2. Use plain Hebrew.
3. Name the exact screen, field, and value type.
4. Stop after that one task.
5. Ask for a screenshot or a short completion confirmation.

Never give a long chain of setup instructions.

## Supabase Vocabulary

Always distinguish these:

- `SUPABASE_URL`: project API URL.
- `SUPABASE_SERVICE_ROLE_KEY`: backend-only API key.
- `SUPABASE_DB_URL`: Postgres connection string used for schema/grants/migrations.
- database password: only the password segment inside a connection string.
- schema: SQL tables, indexes, RLS, grants.
- realtime: publication/subscription layer.

Do not say "Supabase key" without naming which key.

## Storage Direction

Production storage direction is relational Supabase.

Rules:

- Keep local `.data/demo-state.json` as development fallback.
- Do not add runtime reads/writes to `demo_storage_states`.
- Treat `demo_storage_states` as legacy compatibility only until cleanup migration.
- QA should check relational runtime tables and fail on active JSON bridge usage.

## Implementation Loop

For each step:

1. State the objective.
2. Inspect existing files.
3. Make scoped edits.
4. Run build.
5. Run QA.
6. Run smoke tests relevant to the touched path.
7. Self-review the diff.
8. Fix issues.
9. Update docs/status.
10. Commit and push only after evidence passes.
11. After Render deploy, run public smoke.

If any validation cannot run, record the exact blocker and do not mark the step complete.

## QA Alignment

QA must validate the current product architecture, not yesterday's migration step.

Before changing QA:

- verify which behavior is now canonical
- keep regression checks for completed features
- remove checks that protect retired paths

Completed Kodi features that must not regress:

- Hebrew group-chat model with Kodi as participant
- admin-only operational changes
- live member location with consent
- Google-imported places fixture
- Waze/Google Maps navigation links
- group destination
- group route and progress
- setup/onboarding state

## Render/GitHub Discipline

Do not treat deploy as complete until public smoke passes.

Minimum public smoke:

- `/api/health`
- `/api/trips/demo/storage`
- one endpoint changed by the current work

Record public smoke date/result in docs when the step changes production behavior.

## Blocker Handling

When blocked:

1. Name the blocker precisely.
2. Decide whether it is code, environment, permission, product ambiguity, or external service.
3. Try the safest automation path first.
4. If user action is required, ask for one action only.
5. Add the lesson to `docs/AGENT_LESSONS_AND_BLOCKERS.md` if it is recurring or expensive.

## Communication

Keep updates short and concrete.

Use Hebrew for user-facing instructions unless code or exact labels require English.

Do not overload the user with infrastructure concepts. Translate technical work into the next operational decision.
