# Deployment Plan

## Current Rule

This travel app must be deployed as a new product.

Do not reuse or overwrite the existing PB Trading Cockpit GitHub repository or Render service.

Existing PB assets are protected:

- GitHub: `https://github.com/yakobmo/pb-pro-trading-cockpit`
- Render: `https://pb-pro-trading-cockpit.onrender.com`

## Current Local Git State

- Branch: `main`
- Initial commit: `3f0d825 Initial AI travel companion MVP`
- Render preparation commit: `5dbb07f Prepare single-service Render deploy`
- GitHub repository: `https://github.com/yakobmo/kodi-travel-companion`
- Remote: `origin`
- QA passed before the initial commit.
- Build passed for both API and web before the initial commit.
- Local smoke test passed before the initial commit.

## Next Step

Create a new Render web service for this app from:

```text
https://github.com/yakobmo/kodi-travel-companion
```

## Render Plan

Render is now connected as a new service:

- Service name: `kodi-travel-companion`
- Service ID: `srv-d8u2lr0js32c73cajpqg`
- Public URL: `https://kodi-travel-companion.onrender.com`
- Status: live
- Last verified at: `2026-06-24`

Post-deploy smoke passed:

- `/` returned HTTP 200.
- `/api/health` returned HTTP 200 with `{"ok":true,"service":"ai-travel-companion-api","version":"0.1.0"}`.

Render setup rules:

1. Create a new Render service.
2. Connect it to the new travel-app repository.
3. Do not connect it to the PB Trading Cockpit repository.
4. Add environment variables only through Render dashboard.
5. Run a public smoke test after the first deploy.

## Production Dependencies Still Needed

The app can run locally as an MVP, but production-grade deployment will later need:

- Supabase project and database schema.
- Realtime channel setup.
- Google Maps browser key with domain restrictions.
- Google OAuth app.
- OpenAI API key.
- Render environment variables.

No secret should be committed to Git.
