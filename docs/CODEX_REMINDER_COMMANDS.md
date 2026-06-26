# Codex Reminder Commands

These are short commands the user can type in Codex before work starts.

They are intended to function like a lightweight dashboard: one short phrase triggers the matching operating protocol.

## Button-Style Skills

Personal Codex skills were also created under:

```text
C:\Users\yaako\.codex\skills\
```

They are intended to appear as selectable skill chips/buttons when the Codex UI surfaces personal skills:

- `Kodi Protocol`
- `Kodi Continue`
- `Kodi QA`
- `Kodi Blockers`

If the buttons do not appear immediately, restart the Codex desktop app and open the skills/tool picker again.

If the UI still does not show them as buttons, use the text commands below. The text commands are the fallback control surface.

## Main Command

```text
פרוטוקול קודי
```

Meaning:

Before doing anything, read the Kodi build protocol, identify the current stage, inspect git status, and continue only through the build/QA/self-review loop.

## Focused Commands

```text
קודי המשך מסודר
```

Resume the next implementation step, but first inspect status, current docs, and git state.

```text
קודי QA
```

Run the QA mindset first: list the relevant gates, run checks, report failures, then fix.

```text
קודי חסמים
```

Stop implementation and analyze blockers: what is blocking, why, whether automation can solve it, and whether user action is truly required.

```text
תזכורת קודי
```

Reload the protocol before continuing.

```text
הפעל נוהל קודי
```

Same as the main command, in plain Hebrew.

## Rule For Codex

When one of these commands appears, do not treat it as a normal chat phrase.

Treat it as a control instruction:

1. Load `kodi-build-protocol`.
2. Read `AGENTS.md` if inside the Kodi repository.
3. Report the current stage.
4. Continue only after checking the relevant evidence.
