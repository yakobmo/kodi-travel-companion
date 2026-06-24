# Development Workflow

## Principle

Do not push every change immediately.

Every change should pass:

1. Local edit.
2. Local QA.
3. Commit with a clear message.
4. Push to GitHub.
5. Render auto deploy.
6. Smoke test on public site.

## Local QA

Minimum before commit:

- Project files exist.
- JSON files parse.
- TypeScript source files are present.
- No obvious secret files are committed.
- `git diff --check` when inside a Git repository.

## Publish

Later we will use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/publish.ps1 -Message "..."
```

Use `-NoPush` to commit without pushing.
