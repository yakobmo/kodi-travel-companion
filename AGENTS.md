# Kodi Agent Operating Rules

This repository uses a fixed build protocol.

Before changing code:

1. Identify the current stage.
2. Run `git status --short`.
3. Read the relevant existing files before adding new concepts.
4. Prefer automation over manual user copy/paste.
5. If user action is unavoidable, ask for exactly one action.

During implementation:

1. Keep changes scoped.
2. Preserve completed product decisions:
   - Kodi is a participant in the family group chat.
   - Operational actions require owner/admin permission.
   - Live member location requires explicit consent.
   - Production storage is relational Supabase.
   - `.data/demo-state.json` is local fallback only.
   - `demo_storage_states` is legacy compatibility only.
3. Do not reintroduce active runtime dependency on the retired JSON bridge.

Before declaring work complete:

1. Run build when toolchain is available.
2. Run `scripts/qa.ps1`.
3. Run local or public smoke tests relevant to the touched path.
4. Update status/docs when architecture, deployment, or process changes.
5. Commit and push only after evidence passes.

Operational references:

- `docs/AGENT_LESSONS_AND_BLOCKERS.md`
- `.codex/skills/kodi-build-protocol/SKILL.md`

