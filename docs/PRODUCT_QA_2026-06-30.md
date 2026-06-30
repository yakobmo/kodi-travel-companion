# Product QA - 2026-06-30

## Source Of Truth

Reviewed:

- `docs/CORE_EXPERIENCE_AND_ONBOARDING.md`
- `docs/GOOGLE_INTEGRATION_PLAN.md`
- `docs/PROJECT_STATUS.md`
- current web and API implementation

Core product rule:

```text
Google Maps is the map. Kodi is the agent layer that mediates the map, trip points, group context, and navigation actions for the participants.
```

Kodi must not recreate Google Maps navigation, gestures, compass, follow-location, or native route/map behavior.

## QA Result

Status: conditionally pass for the current MVP slice.

The product now has the right center of gravity:

- Google Maps JavaScript API renders the map in production.
- Kodi adds trip points, group context, Waze/Google Maps navigation, chat, usage gating, and permissions.
- The fallback map is documented and treated as development-only.
- Mobile hides secondary management areas by default.

The product is not yet complete against the full vision because OAuth live Google account sync and OpenAI-backed reasoning are not implemented yet.

## Findings

### P0 - None Found

No current blocker was found that invalidates the product heart after the Google Maps browser activation.

### P1 - OAuth Google Account Sync Is Still Missing

The app can read and display the imported Google trip fixture and can use Google Maps, Places, and Routes APIs, but it does not yet connect to the user's Google account and let the manager choose a real Google Maps trip/list from the account.

Current acceptable behavior:

- The UI must say link preview/read-only clearly.
- The product must not claim live Google account sync.
- Write-back to Google Maps must remain disabled.

Required future slice:

- Google OAuth.
- Account connection for the trip owner.
- Selection of the real Google Maps trip/list, such as "North Greece".
- Permissioned read path before any write-back attempt.

### P1 - Kodi OpenAI Bridge Exists, Live Key Still Required

The API package includes OpenAI as a dependency, the usage model includes `openai_agent`, and `/api/agent/message` now has a backend-only OpenAI bridge guarded by the trip usage pool.

Current acceptable behavior:

- If `OPENAI_API_KEY` is missing, Kodi falls back to the local rules flow and still responds.
- The response exposes safe runtime evidence (`agentRuntime`) but never exposes provider secrets.
- The OpenAI prompt is grounded in trip state, recent group conversation, selected map context, Places results, Routes results, and permissions.
- The bridge tells Kodi not to claim live Google account sync or Google Maps write-back before OAuth exists.

Required future slice:

- Add `OPENAI_API_KEY` to Render when the owner-managed usage pool is ready for live AI cost.
- Run a live agent smoke that confirms `source=openai` without key leakage.
- Tool/guard layer so Kodi can ask clarifying questions before expensive or operational actions.
- Usage accounting for successful OpenAI calls under the trip owner's shared pool.

### P2 - Fixed In This QA: Manager Location Step Had The Wrong Primary Action

Before this QA pass, after manager GPS became active the primary button still refreshed location, while "continue" was secondary. That violated the "one clear next action" onboarding rule.

Fix applied:

- Once manager location is active, the primary action is now "continue to map and chat".
- Refresh location moved to a secondary quiet action.
- Local smoke now asserts this behavior.

### P2 - Google Maps Loader Uses Legacy Marker Path

Production smoke shows Google Maps renders correctly, but Google warns that `google.maps.Marker` is deprecated and `AdvancedMarkerElement` is recommended.

This is not a product blocker, but should be handled before serious map-marker customization.

### P2 - Script Loading Should Use Google's Recommended Async Pattern

Google Maps loads and renders, but Google warns about direct loading without the recommended async pattern.

This is not a product blocker, but should be cleaned up with the next map implementation pass.

## Product Gates For Next Work

Before adding any feature, verify:

1. Does it make `Kodi + Google Maps + trip points + manager location` clearer?
2. Does Google Maps remain the map engine?
3. Does Kodi act as the group agent, not a separate chatbot panel?
4. Does the UI avoid claiming live Google sync before OAuth exists?
5. Does any operational action still require manager/admin permission?

## Current Next Product Step

Recommended next step:

Implement the real agent bridge before adding more visual chrome:

```text
group message -> Kodi wake detection -> context resolver -> Places/Routes if needed -> OpenAI grounded response -> optional manager approval action
```

OAuth live Google account sync remains the next major Google data step after the agent bridge is stable.
