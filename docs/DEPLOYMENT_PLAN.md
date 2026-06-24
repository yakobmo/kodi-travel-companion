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
- QA passed before the initial commit.
- Build passed for both API and web before the initial commit.
- Local smoke test passed before the initial commit.

## Next Step

Create a new GitHub repository for this app, then connect it as the remote origin.

Recommended repository names:

- `ai-travel-companion`
- `kodi-travel-companion`

After the new repository exists:

```powershell
git remote add origin https://github.com/yakobmo/ai-travel-companion.git
git push -u origin main
```

If a different repository name is chosen, use that repository URL instead.

## Render Plan

After GitHub is connected:

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
