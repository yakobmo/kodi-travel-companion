const baseUrl = process.env.KODI_PUBLIC_URL ?? "https://kodi-travel-companion.onrender.com";

function assertCheck(name, condition, details) {
  if (!condition) {
    const suffix = details ? `: ${details}` : "";
    throw new Error(`Google Places live smoke failed: ${name}${suffix}`);
  }
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response, got: ${text.slice(0, 300)}`);
  }
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    response,
    payload: await readJson(response)
  };
}

async function postJson(path, data) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });
  return {
    response,
    payload: await readJson(response)
  };
}

const health = await getJson("/api/health");
assertCheck("health", health.response.ok && health.payload.ok === true);

const storage = await getJson("/api/trips/demo/storage");
assertCheck("storage", storage.response.ok && storage.payload.storage?.driver === "supabase");

const readiness = await getJson("/api/trips/demo/google-source/readiness");
const placesRequirement = readiness.payload.requirements?.find(
  (requirement) => requirement.name === "GOOGLE_MAPS_API_KEY" && requirement.purpose === "places"
);
assertCheck("GOOGLE_MAPS_API_KEY configured", placesRequirement?.configured === true);

const places = await getJson(
  "/api/google/places/text-search?query=gelato%20near%20hotel&lat=39.2514&lng=22.7515&radiusMeters=3000"
);
assertCheck("places endpoint ok", places.response.ok);
assertCheck("places status ready", places.payload.status === "ready", `status=${places.payload.status}`);
assertCheck("places has results", Array.isArray(places.payload.places) && places.payload.places.length > 0);
assertCheck("places hides api key", places.payload.apiKey === undefined);
assertCheck(
  "places fields",
  places.payload.places.some((place) => place.displayName || place.formattedAddress || place.googleMapsUri)
);

const message = "קודי, בא לילדים גלידה קרוב למלון. מה יש באזור?";
const agent = await postJson("/api/agent/message", {
  member: { id: "mom", displayName: "אמא", role: "owner", ageGroup: "adult" },
  message,
  recentMessages: []
});
assertCheck("agent response ok", agent.response.ok);
assertCheck("agent places status ready", agent.payload.contextSummary?.externalPlacesSearchStatus === "ready");
assertCheck("agent mentions Google Places", String(agent.payload.text ?? "").includes("Google Places"));

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      storageDriver: storage.payload.storage.driver,
      placesCount: places.payload.places.length,
      firstPlace: places.payload.places[0]?.displayName,
      agentIntent: agent.payload.intent,
      agentExternalPlacesSearchStatus: agent.payload.contextSummary.externalPlacesSearchStatus
    },
    null,
    2
  )
);
