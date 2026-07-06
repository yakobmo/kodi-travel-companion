const baseUrl = process.env.KODI_AGENT_BASE_URL ?? process.env.KODI_PUBLIC_URL ?? "https://kodi-travel-companion.onrender.com";
const timeoutMs = Number(process.env.KODI_AGENT_REGRESSION_TIMEOUT_MS ?? 45000);
const maxLatencyMs = Number(process.env.KODI_AGENT_REGRESSION_MAX_LATENCY_MS ?? 18000);

function assertCheck(name, condition, details = "") {
  if (!condition) {
    throw new Error(`Kodi agent regression failed: ${name}${details ? `: ${details}` : ""}`);
  }
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response, got: ${text.slice(0, 400)}`);
  }
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  return {
    response,
    payload: await readJson(response)
  };
}

async function postAgent(message, options = {}) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl}/api/agent/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      tripGroupId: "group_family_greece_demo",
      member: options.member ?? {
        id: "mom",
        displayName: "מנהל הטיול",
        role: "owner",
        ageGroup: "adult"
      },
      message,
      recentMessages: options.recentMessages ?? [
        {
          author: "מנהל הטיול",
          text: message,
          source: "member",
          memberId: "mom"
        }
      ],
      context: {
        currentLocation: options.currentLocation,
        permissionPolicy: {
          operationalChangesRequireAdmin: true,
          canShareLiveLocation: false
        }
      },
      selectedPlace: options.selectedPlace
    })
  });
  const payload = await readJson(response);

  return {
    response,
    payload,
    elapsedMs: Date.now() - startedAt
  };
}

function expectHealthyAgentResult(name, result) {
  const text = String(result.payload.text ?? "");

  assertCheck(`${name} response ok`, result.response.ok, `status=${result.response.status}`);
  assertCheck(`${name} has text`, text.trim().length > 0);
  assertCheck(`${name} latency`, result.elapsedMs <= maxLatencyMs, `elapsedMs=${result.elapsedMs}`);
  assertCheck(`${name} not browser fallback`, !text.includes("תגידו לי מה צריך עכשיו: ניווט"));
  assertCheck(`${name} no feminine Kodi self-reference`, !text.includes("אני יכולה"));
  assertCheck(`${name} no fake future-live disclaimer`, !text.includes("כשיהיה חיבור חי מלא"));
  assertCheck(`${name} no markdown stars`, !text.includes("**"));
}

const health = await getJson("/api/health");
assertCheck("health", health.response.ok && health.payload.ok === true);

const liveCafe = await postAgent("קודי איזה בית קפה פתוח יש באזור שלי כרגע?", {
  currentLocation: {
    lat: 31.252973,
    lng: 34.791462
  }
});
expectHealthyAgentResult("live cafe", liveCafe);
assertCheck(
  "live cafe uses live location",
  liveCafe.payload.contextSummary?.timelineReferenceConfidence === "live_location",
  `timeline=${liveCafe.payload.contextSummary?.timelineReferenceConfidence}`
);
assertCheck(
  "live cafe uses Google Places",
  liveCafe.payload.contextSummary?.externalPlacesSearchStatus === "ready",
  `places=${liveCafe.payload.contextSummary?.externalPlacesSearchStatus}`
);
assertCheck("live cafe includes Maps", String(liveCafe.payload.text ?? "").includes("Google Maps"));
assertCheck("live cafe includes Waze", String(liveCafe.payload.text ?? "").includes("Waze"));
assertCheck("live cafe does not drift to Greece", !/Almiros|Velestino|Amaliapoli|Chorefto|Pelion/i.test(String(liveCafe.payload.text ?? "")));

const tripNature = await postAgent("קודי מה אופי הטיול שלנו ביוון?");
expectHealthyAgentResult("trip nature", tripNature);
assertCheck("trip nature mentions north Greece or Pelion", /צפון יוון|פיליון|זגוריה|צומרקה/.test(String(tripNature.payload.text ?? "")));

const actionableYouCan = await postAgent("קודי אתה יכול לעשות לי סדר במקומות לינה?");
expectHealthyAgentResult("actionable you can", actionableYouCan);
assertCheck(
  "actionable you can is not presence ping",
  actionableYouCan.payload.source !== "fast_presence",
  `source=${actionableYouCan.payload.source}`
);
assertCheck(
  "actionable you can answers lodging task",
  /לינה|מלון|מקומות/.test(String(actionableYouCan.payload.text ?? "")),
  String(actionableYouCan.payload.text ?? "").slice(0, 200)
);

const routeMap = await postAgent("קודי סמן לי על המפה את המסלול");
expectHealthyAgentResult("route map", routeMap);
assertCheck("route map intent", ["route_creation", "general"].includes(String(routeMap.payload.intent ?? "")));
assertCheck("route map mentions route anchors", /אתונה|צומרקה|זגוריה|פיליון/.test(String(routeMap.payload.text ?? "")));
assertCheck("route map does not dodge drawing", !String(routeMap.payload.text ?? "").includes("לא יכול להחזיר צילום מסך"));

const currentLocation = await postAgent("קודי איפה אני עכשיו?", {
  currentLocation: {
    lat: 31.252973,
    lng: 34.791462
  }
});
expectHealthyAgentResult("current location", currentLocation);
assertCheck(
  "current location asks reverse geocode or live location",
  currentLocation.payload.contextSummary?.timelineReferenceConfidence === "live_location"
);

const guide = await postAgent("קודי ספר לי בקצרה על גשר ריו אנטיריו שנעבור בדרך");
expectHealthyAgentResult("local guide", guide);
assertCheck("guide mentions bridge", /ריו|אנטיריו|גשר/.test(String(guide.payload.text ?? "")));

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      checks: {
        liveCafe: {
          elapsedMs: liveCafe.elapsedMs,
          source: liveCafe.payload.source,
          openAiStatus: liveCafe.payload.agentRuntime?.openAiStatus,
          timeline: liveCafe.payload.contextSummary?.timelineReferenceConfidence
        },
        tripNature: {
          elapsedMs: tripNature.elapsedMs,
          source: tripNature.payload.source,
          openAiStatus: tripNature.payload.agentRuntime?.openAiStatus
        },
        actionableYouCan: {
          elapsedMs: actionableYouCan.elapsedMs,
          source: actionableYouCan.payload.source,
          openAiStatus: actionableYouCan.payload.agentRuntime?.openAiStatus
        },
        routeMap: {
          elapsedMs: routeMap.elapsedMs,
          intent: routeMap.payload.intent,
          source: routeMap.payload.source
        },
        currentLocation: {
          elapsedMs: currentLocation.elapsedMs,
          source: currentLocation.payload.source
        },
        guide: {
          elapsedMs: guide.elapsedMs,
          source: guide.payload.source
        }
      }
    },
    null,
    2
  )
);
