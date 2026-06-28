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

## Google Capability Split

Use separate Google layers:

- Maps URLs: open Google Maps search, directions, and map views without an API key.
- Places API: enrich or search places after configuring a Google Maps Platform key.
- Routes API: calculate routes, distances, and ETAs after configuring a Google Maps Platform key.
- OAuth / user account access: required before any user-specific live sync or write-back workflow.

## Next Slice

Next implementation should add a controlled Google source adapter boundary:

1. Keep the current fixture adapter as `read_only_fixture`.
2. Add a second adapter contract for future Google API-backed reads.
3. Keep write-back disabled until a proven and permissioned Google path exists.
4. Add QA that fails if UI copy implies live Google editing before it is real.

## Official References

- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
- Places API Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search
- Routes API: https://developers.google.com/maps/documentation/routes
