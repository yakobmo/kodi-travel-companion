const baseUrl = process.env.KODI_PUBLIC_URL ?? "https://kodi-travel-companion.onrender.com";

function assertCheck(name, condition, details) {
  if (!condition) {
    const suffix = details ? `: ${details}` : "";
    throw new Error(`Google Routes live smoke failed: ${name}${suffix}`);
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
const routesRequirement = readiness.payload.requirements?.find(
  (requirement) => requirement.name === "GOOGLE_MAPS_API_KEY" && requirement.purpose === "routes"
);
assertCheck("GOOGLE_MAPS_API_KEY routes configured", routesRequirement?.configured === true);

const route = await getJson(
  "/api/google/routes/estimate?originLat=39.2514&originLng=22.7515&destinationLat=39.935888&destinationLng=20.670744&travelMode=DRIVE"
);
assertCheck("route endpoint ok", route.response.ok);
assertCheck("route status ready", route.payload.status === "ready", `status=${route.payload.status}`);
assertCheck("route has duration", route.payload.route?.durationSeconds > 0);
assertCheck("route has distance", route.payload.route?.distanceMeters > 0);
assertCheck("route hides api key", route.payload.apiKey === undefined);

const clearDestinationAgent = await postJson("/api/agent/message", {
  member: { id: "dad", displayName: "\u05d0\u05d1\u05d0", role: "owner", ageGroup: "adult" },
  message:
    "\u05e7\u05d5\u05d3\u05d9, \u05db\u05de\u05d4 \u05d6\u05de\u05df \u05e0\u05e1\u05d9\u05e2\u05d4 \u05e2\u05d3 \u05d4\u05d9\u05e2\u05d3 \u05d4\u05e7\u05d1\u05d5\u05e6\u05ea\u05d9 \u05d4\u05e0\u05d5\u05db\u05d7\u05d9?",
  recentMessages: []
});
assertCheck("clear destination agent response ok", clearDestinationAgent.response.ok);
assertCheck(
  "clear destination agent route status ready",
  clearDestinationAgent.payload.contextSummary?.routeEstimateStatus === "ready"
);
assertCheck("clear destination agent mentions Google Routes", String(clearDestinationAgent.payload.text ?? "").includes("Google Routes"));

const ambiguousHotelAgent = await postJson("/api/agent/message", {
  member: { id: "dad", displayName: "\u05d0\u05d1\u05d0", role: "owner", ageGroup: "adult" },
  message:
    "\u05e7\u05d5\u05d3\u05d9, \u05db\u05de\u05d4 \u05d6\u05de\u05df \u05e0\u05e1\u05d9\u05e2\u05d4 \u05d9\u05e9 \u05dc\u05e0\u05d5 \u05e2\u05d3 \u05d4\u05de\u05dc\u05d5\u05df?",
  recentMessages: []
});
assertCheck("ambiguous hotel agent response ok", ambiguousHotelAgent.response.ok);
assertCheck(
  "ambiguous hotel agent asks clarification",
  Boolean(ambiguousHotelAgent.payload.contextSummary?.tripContextClarification) ||
    String(ambiguousHotelAgent.payload.text ?? "").includes("\u05e8\u05e7 \u05dc\u05d5\u05d5\u05d3\u05d0")
);

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      storageDriver: storage.payload.storage.driver,
      routeDurationText: route.payload.route.durationText,
      routeDistanceText: route.payload.route.distanceText,
      clearDestinationAgentIntent: clearDestinationAgent.payload.intent,
      clearDestinationAgentRouteEstimateStatus: clearDestinationAgent.payload.contextSummary.routeEstimateStatus,
      ambiguousHotelAgentIntent: ambiguousHotelAgent.payload.intent,
      ambiguousHotelClarification: ambiguousHotelAgent.payload.contextSummary.tripContextClarification ?? ambiguousHotelAgent.payload.text
    },
    null,
    2
  )
);
