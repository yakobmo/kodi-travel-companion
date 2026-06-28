# Google Integration Plan

## Current Decision

Kodi starts Google integration with a read-only source preview.

This means:

- The app can verify that a Google-sourced trip list is represented in Kodi.
- The app can count imported places, coordinates, and Google source IDs.
- The app can open Google Maps URLs without an API key.
- The app cannot write back to the user's Google Maps account yet.
- The app cannot promise live Google list sync yet.

## Implemented Slice

Endpoint:

```text
GET /api/trips/demo/google-source
```

It returns:

- Source identity and source URL.
- `read_only_preview` state.
- Imported place count.
- Coordinate coverage.
- Whether write-back is available.
- Which future Google capabilities are required.

Current sync mode:

```text
read_only_fixture
```

This protects the product from pretending that Kodi has edit access to Google Maps before OAuth and a supported API path exist.

## Adapter Boundary

Implemented boundary:

```text
apps/api/src/google/sourceAdapter.ts
```

The active adapter is:

```text
fixtureGoogleSourceAdapter
```

Its contract says:

- `adapter.kind = fixture`
- `adapter.liveGoogleAccess = false`
- `sync.mode = read_only_fixture`
- `sync.canWriteBackToGoogle = false`

Any future Google API adapter must preserve the same response shape before replacing the fixture path.

Non-active future adapter:

```text
googleApiSourceAdapter
```

It reports `not_configured` until the Google environment contract is ready. It does not perform network calls, does not read user Google data, and does not write back to Google.

Readiness endpoint:

```text
GET /api/trips/demo/google-source/readiness
```

It reports only whether required environment variables are configured. It must never expose API keys, OAuth secrets, tokens, or raw credential values.

Required future variables:

- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`

## Google Capability Split

Use separate Google layers:

- Maps URLs: open Google Maps search, directions, and map views without an API key.
- Places API: enrich or search places after configuring a Google Maps Platform key.
- Routes API: calculate routes, distances, and ETAs after configuring a Google Maps Platform key.
- OAuth / user account access: required before any user-specific live sync or write-back workflow.

## Next Slice

Next implementation should prepare the first real Google API read path:

1. Keep the current fixture adapter as the active adapter.
2. Decide whether the first live read uses Places API enrichment or OAuth account connection.
3. Keep write-back disabled until a proven and permissioned Google path exists.
4. Keep QA failing if UI copy implies live Google editing before it is real.

## Official References

- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
- Places API Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search
- Routes API: https://developers.google.com/maps/documentation/routes
