import assert from "node:assert/strict";

process.env.GOOGLE_MAPS_API_KEY = "qa-placeholder";

const originalFetch = globalThis.fetch;
globalThis.fetch = async () =>
  new Response(
    JSON.stringify({
      places: [
        {
          id: "beer-sheva-cafe",
          displayName: { text: "קפה מקומי" },
          formattedAddress: "באר שבע",
          location: { latitude: 31.251, longitude: 34.801 },
          rating: 4.7,
          userRatingCount: 120,
          types: ["cafe"]
        },
        {
          id: "tel-aviv-cafe",
          displayName: { text: "קפה רחוק" },
          formattedAddress: "תל אביב",
          location: { latitude: 32.0853, longitude: 34.7818 },
          rating: 4.9,
          userRatingCount: 5000,
          types: ["cafe"]
        }
      ]
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );

try {
  const { searchGooglePlacesText } = await import("../apps/api/dist/google/placesSearch.js");
  const result = await searchGooglePlacesText({
    query: "בתי קפה",
    lat: 31.2495788,
    lng: 34.8020377,
    radiusMeters: 3_000,
    restrictToLocation: true,
    languageCode: "he"
  });

  assert.equal(result.status, "ready");
  assert.equal(result.request.hasLocationRestriction, true);
  assert.deepEqual(result.places.map((place) => place.id), ["beer-sheva-cafe"]);
  console.log("Google Places hard-radius regression: ok");
} finally {
  globalThis.fetch = originalFetch;
}
