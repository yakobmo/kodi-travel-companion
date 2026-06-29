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

const agent = await postJson("/api/agent/message", {
  member: { id: "dad", displayName: "אבא", role: "owner", ageGroup: "adult" },
  message: "קודי, כמה זמן נסיעה יש לנו עד המלון?",
  recentMessages: []
});
assertCheck("agent response ok", agent.response.ok);
assertCheck("agent route status ready", agent.payload.contextSummary?.routeEstimateStatus === "ready");
assertCheck("agent mentions Google Routes", String(agent.payload.text ?? "").includes("Google Routes"));

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      storageDriver: storage.payload.storage.driver,
      routeDurationText: route.payload.route.durationText,
      routeDistanceText: route.payload.route.distanceText,
      agentIntent: agent.payload.intent,
      agentRouteEstimateStatus: agent.payload.contextSummary.routeEstimateStatus
    },
    null,
    2
  )
);
