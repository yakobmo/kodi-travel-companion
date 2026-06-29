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

These variables belong to the backend service or to an owner-authorized trip connection.
They are not participant-level credentials.

## Google Capability Split

Use separate Google layers:

- Maps URLs: open Google Maps search, directions, and map views without an API key.
- Places API: enrich or search places after configuring a Google Maps Platform key.
- Routes API: calculate routes, distances, and ETAs after configuring a Google Maps Platform key.
- OAuth / user account access: required before any user-specific live sync or write-back workflow.
- Trip Context Resolver: Kodi must resolve the current reference point before calling Places or Routes. The reference can come from live GPS, active group destination, active route stop, nearby lodging, or recent conversation context.
- Trip Timeline Resolver: Kodi must derive a trip-stage view from the imported Google map order so future questions such as "in two days near the Pelion hotel" can use the right lodging anchor before live OAuth exists.

Use one trip-space usage model:

- The trip owner connects or pays for the Google/API capability.
- Members send requests through the app backend.
- The backend performs Google calls and returns safe results to the group.
- Waze, Booking, Airbnb, and similar apps remain outbound links only; they do not become billing or data sources for Kodi.

Kodi should not be fed endless category-specific rules such as "gelato", "sushi", "fuel", or "toilets". Those are natural-language user needs that become Google Places queries. The agent layer decides whether the reference is clear enough. If it is not clear enough, Kodi asks a short clarification question.

## Trip Timeline Resolver

Implemented endpoint:

```text
GET /api/trips/demo/timeline
```

Current behavior:

- Reads the same imported Google Maps fixture as the trip state.
- Sorts places by Google map source order.
- Builds lodging-centered trip segments.
- Adds date hints from saved notes when they exist.
- Adds region hints such as Pelion, Zagori, Meteora, Tzoumerka, Athens, and Olympus when detected from place names, addresses, or nearby places.
- Exposes a confidence level for each segment.

Kodi agent connection:

- Before external Places search, Kodi resolves whether the message points to a future region or lodging segment.
- If a segment is resolved, Places search uses that lodging as the location bias.
- If no segment is clear enough, Kodi falls back to live member location, group destination, or first known place.
- This is still read-only. It does not claim live Google account sync or write-back.

## Next Slice

The first real Google read path is Places API Text Search, not OAuth.

Implemented endpoint:

```text
GET /api/google/places/text-search
```

Query parameters:

- `query`: required natural-language search text.
- `lat` and `lng`: optional location bias.
- `radiusMeters`: optional search radius, clamped server-side.
- `languageCode`: defaults to `he`.
- `regionCode`: optional Google region bias.

Behavior:

- If `GOOGLE_MAPS_API_KEY` is missing, the endpoint returns `not_configured`.
- If the key exists, the server calls Google Places Text Search.
- The endpoint uses an explicit field mask and never exposes the API key.
- The response is read-only and cannot modify Google Maps or the user's Google account.

Kodi agent connection:

- Nearby-needs questions call the guarded Places read path from the server using the natural user request as the query, with current trip context as location bias.
- If Places is not configured, Kodi explains that live Google Places search is not active yet and continues to reason from the saved trip map.
- When `GOOGLE_MAPS_API_KEY` is configured, the same agent path can include live Places results in the recommendation context.
- Calls are attributed to the trip usage pool, not to each participant separately.

Routes and ETA connection:

```text
GET /api/google/routes/estimate
```

Behavior:

- If `GOOGLE_MAPS_API_KEY` is missing, the endpoint returns `not_configured`.
- If the key exists, the server calls Google Routes `computeRoutes`.
- The endpoint uses the narrow field mask `routes.duration,routes.distanceMeters`.
- Kodi calls Routes only after the Trip Context Resolver has a clear enough origin and destination.
- If the reference is ambiguous, Kodi asks a clarification question before calculating.

Next implementation should deploy and public-smoke this path:

1. Keep the current fixture adapter as the active adapter.
2. Keep Places API Text Search results as secondary evidence in Kodi recommendations.
3. Use Routes API for ETA/distance only after context and timeline resolution.
4. Keep write-back disabled until a proven and permissioned Google path exists.
5. Keep QA failing if UI copy implies live Google editing before it is real.

## Official References

- Google Maps URLs: https://developers.google.com/maps/documentation/urls/get-started
- Places API Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search
- Routes API: https://developers.google.com/maps/documentation/routes
