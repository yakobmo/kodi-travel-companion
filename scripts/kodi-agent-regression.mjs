import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseUrl = process.env.KODI_AGENT_BASE_URL ?? process.env.KODI_PUBLIC_URL ?? "https://kodi-travel-companion.onrender.com";
const timeoutMs = Number(process.env.KODI_AGENT_REGRESSION_TIMEOUT_MS ?? 45000);
const maxLatencyMs = Number(process.env.KODI_AGENT_REGRESSION_MAX_LATENCY_MS ?? 18000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function assertCheck(name, condition, details = "") {
  if (!condition) {
    throw new Error(`Kodi agent regression failed: ${name}${details ? `: ${details}` : ""}`);
  }
}

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function countOccurrences(source, pattern) {
  return (source.match(new RegExp(pattern, "g")) ?? []).length;
}

function assertAgentFirstSourceGuards() {
  const serverSource = readRepoFile("apps/api/src/server.ts");
  const openAiSource = readRepoFile("apps/api/src/agent/openaiAgent.ts");

  assertCheck("agent-first no skipped fast lane", !serverSource.includes("skipped_fast_lane"));
  assertCheck("agent-first no fast concrete provider bypass", !serverSource.includes("!fastConcretePlacesReply"));
  assertCheck("agent-first no fast trip call site", !serverSource.includes("const fastTripAnswer = buildFastTripAnswer"));
  assertCheck(
    "agent-first no fast places pre-router call site",
    countOccurrences(openAiSource, "shouldPreferFastPlacesAnswer") <= 1
  );
  assertCheck("agent-first expanded place context", openAiSource.includes("options.reasoningMode ? 180 : 120"));
  assertCheck(
    "agent-first expanded recent message context",
    openAiSource.includes(".slice(-24)") && openAiSource.includes("message.text.slice(0, 1200)")
  );
}

assertAgentFirstSourceGuards();

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
  assertCheck(`${name} not canned presence`, !text.includes("תשאלו אותי חופשי"));
  assertCheck(`${name} not fast presence`, result.payload.source !== "fast_presence", `source=${result.payload.source}`);
  assertCheck(`${name} no feminine Kodi self-reference`, !text.includes("אני יכולה"));
  assertCheck(`${name} no fake future-live disclaimer`, !text.includes("כשיהיה חיבור חי מלא"));
  assertCheck(`${name} no markdown stars`, !text.includes("**"));
}

const health = await getJson("/api/health");
assertCheck("health", health.response.ok && health.payload.ok === true);

const bareKodi = await postAgent("קודי?");
expectHealthyAgentResult("bare Kodi", bareKodi);

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
  ["ready", "not_configured"].includes(liveCafe.payload.contextSummary?.externalPlacesSearchStatus),
  `places=${liveCafe.payload.contextSummary?.externalPlacesSearchStatus}`
);
if (liveCafe.payload.contextSummary?.externalPlacesSearchStatus === "ready") {
  assertCheck("live cafe includes Maps", String(liveCafe.payload.text ?? "").includes("Google Maps"));
  assertCheck("live cafe includes Waze", String(liveCafe.payload.text ?? "").includes("Waze"));
}
assertCheck("live cafe does not drift to Greece", !/Almiros|Velestino|Amaliapoli|Chorefto|Pelion/i.test(String(liveCafe.payload.text ?? "")));
assertCheck("live cafe not family compromise template", !String(liveCafe.payload.text ?? "").includes("נקודה קלה ליד"));
assertCheck("live cafe not children template", !String(liveCafe.payload.text ?? "").includes("שלא מתאים לילדים"));

const noFreshLocationCafe = await postAgent("קודי איזה בית קפה יש באזור?");
expectHealthyAgentResult("no fresh location cafe", noFreshLocationCafe);
assertCheck(
  "no fresh location cafe requests current location",
  noFreshLocationCafe.payload.contextSummary?.freshCurrentLocationRequired === true &&
    String(noFreshLocationCafe.payload.text ?? "").includes("מיקום נוכחי"),
  String(noFreshLocationCafe.payload.text ?? "").slice(0, 260)
);
assertCheck(
  "no fresh location cafe does not use Places",
  !noFreshLocationCafe.payload.contextSummary?.externalPlacesSearchStatus,
  `places=${noFreshLocationCafe.payload.contextSummary?.externalPlacesSearchStatus}`
);
assertCheck("no fresh location cafe has no stale Maps link", !String(noFreshLocationCafe.payload.text ?? "").includes("Google Maps"));
assertCheck("no fresh location cafe has no stale Waze link", !String(noFreshLocationCafe.payload.text ?? "").includes("Waze"));

const terseCafeAfterFamilyContext = await postAgent("בית קפה באזור", {
  currentLocation: {
    lat: 31.252973,
    lng: 34.791462
  },
  recentMessages: [
    {
      author: "מנהל הטיול",
      text: "בא לילדים משהו קל ליד המלון",
      source: "member",
      memberId: "mom"
    },
    {
      author: "מנהל הטיול",
      text: "בית קפה באזור",
      source: "member",
      memberId: "mom"
    }
  ]
});
expectHealthyAgentResult("terse cafe after family context", terseCafeAfterFamilyContext);
assertCheck(
  "terse cafe after family context not family compromise",
  !String(terseCafeAfterFamilyContext.payload.text ?? "").includes("נקודה קלה ליד") &&
    !String(terseCafeAfterFamilyContext.payload.text ?? "").includes("שלא מתאים לילדים"),
  String(terseCafeAfterFamilyContext.payload.text ?? "").slice(0, 260)
);
if (terseCafeAfterFamilyContext.payload.contextSummary?.externalPlacesSearchStatus === "ready") {
  assertCheck(
    "terse cafe after family context uses places",
    String(terseCafeAfterFamilyContext.payload.text ?? "").includes("Google Places") ||
      String(terseCafeAfterFamilyContext.payload.text ?? "").includes("Google Maps")
  );
}

const tripNature = await postAgent("קודי מה אופי הטיול שלנו ביוון?");
expectHealthyAgentResult("trip nature", tripNature);
assertCheck("trip nature mentions north Greece or Pelion", /צפון יוון|פיליון|זגוריה|צומרקה/.test(String(tripNature.payload.text ?? "")));

const tripNatureAfterStaleContext = await postAgent("קודי מה אופי הטיול שלנו ביוון?", {
  recentMessages: [
    {
      author: "מנהל הטיול",
      text: "אפשר נקודה קלה ליד Lake sources Louros River עם מינימום הליכה?",
      source: "member",
      memberId: "mom"
    },
    {
      author: "קודי",
      text: "אפשר לחפש נקודה קלה ליד Lake sources Louros River, עם מינימום הליכה ובלי לדחוף את כולם לכיוון שלא מתאים לילדים.",
      source: "agent"
    },
    {
      author: "מנהל הטיול",
      text: "קודי מה אופי הטיול שלנו ביוון?",
      source: "member",
      memberId: "mom"
    }
  ]
});
expectHealthyAgentResult("trip nature ignores stale context", tripNatureAfterStaleContext);
assertCheck(
  "trip nature ignores stale lake context",
  !/Lake sources|Louros/i.test(String(tripNatureAfterStaleContext.payload.text ?? "")),
  String(tripNatureAfterStaleContext.payload.text ?? "").slice(0, 260)
);
assertCheck(
  "trip nature after stale context mentions trip arc",
  /Pelion|Zagori|Tzoumerka|Athens|Marathia|פיליון|זגוריה|צומרקה|אתונה/.test(String(tripNatureAfterStaleContext.payload.text ?? "")),
  String(tripNatureAfterStaleContext.payload.text ?? "").slice(0, 260)
);

const lodgingOrder = await postAgent("קודי מה המלונות לפי הסדר?");
expectHealthyAgentResult("lodging order", lodgingOrder);
assertCheck("lodging order mentions lodging order", /שרשרת הלינות|לינות|מלונות/.test(String(lodgingOrder.payload.text ?? "")));
assertCheck("lodging order mentions known lodging", /Marathia|Pelion|Averof|Athens|אתונה/i.test(String(lodgingOrder.payload.text ?? "")));
assertCheck(
  "lodging order skips external Places",
  !lodgingOrder.payload.contextSummary?.externalPlacesSearchStatus,
  `places=${lodgingOrder.payload.contextSummary?.externalPlacesSearchStatus}`
);
assertCheck("lodging order not family template", !String(lodgingOrder.payload.text ?? "").includes("נקודה קלה ליד"));
assertCheck("lodging order no random navigation", !String(lodgingOrder.payload.text ?? "").includes("Acropolis"));

const athensLodgingCorrection = await postAgent("לא ..באתונה", {
  recentMessages: [
    {
      author: "מנהל הטיול",
      text: "קודי איפה ישנים לפי הסדר?",
      source: "member",
      memberId: "mom"
    },
    {
      author: "מנהל הטיול",
      text: "לא ..באתונה",
      source: "member",
      memberId: "mom"
    }
  ]
});
expectHealthyAgentResult("athens lodging correction", athensLodgingCorrection);
assertCheck(
  "athens lodging correction answers Athens",
  /אתונה|Athens|Averof/i.test(String(athensLodgingCorrection.payload.text ?? "")),
  String(athensLodgingCorrection.payload.text ?? "").slice(0, 260)
);
assertCheck(
  "athens lodging correction skips external Places",
  !athensLodgingCorrection.payload.contextSummary?.externalPlacesSearchStatus,
  `places=${athensLodgingCorrection.payload.contextSummary?.externalPlacesSearchStatus}`
);
assertCheck("athens lodging correction no random Acropolis", !String(athensLodgingCorrection.payload.text ?? "").includes("Acropolis"));

const actionableYouCan = await postAgent("קודי אתה יכול לעשות לי סדר במקומות לינה?");
expectHealthyAgentResult("actionable you can", actionableYouCan);
if (actionableYouCan.payload.agentRuntime?.openAiStatus === "ready") {
  assertCheck(
    "actionable you can answers lodging task",
    /לינה|מלון|מקומות/.test(String(actionableYouCan.payload.text ?? "")),
    String(actionableYouCan.payload.text ?? "").slice(0, 200)
  );
}

const broadTravelContext = await postAgent("קודי מה כדאי לדעת היום?");
expectHealthyAgentResult("broad travel context", broadTravelContext);
if (broadTravelContext.payload.agentRuntime?.openAiStatus !== "ready") {
  assertCheck(
    "broad travel context fallback not random attraction",
    !String(broadTravelContext.payload.text ?? "").includes("ההמלצה שלי כרגע היא"),
    String(broadTravelContext.payload.text ?? "").slice(0, 220)
  );
}

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
if (guide.payload.agentRuntime?.openAiStatus === "ready") {
  assertCheck("guide mentions bridge", /ריו|אנטיריו|גשר/.test(String(guide.payload.text ?? "")));
}

console.log(
  JSON.stringify(
    {
      ok: true,
      baseUrl,
      checks: {
        bareKodi: {
          elapsedMs: bareKodi.elapsedMs,
          source: bareKodi.payload.source,
          openAiStatus: bareKodi.payload.agentRuntime?.openAiStatus
        },
        liveCafe: {
          elapsedMs: liveCafe.elapsedMs,
          source: liveCafe.payload.source,
          openAiStatus: liveCafe.payload.agentRuntime?.openAiStatus,
          timeline: liveCafe.payload.contextSummary?.timelineReferenceConfidence
        },
        noFreshLocationCafe: {
          elapsedMs: noFreshLocationCafe.elapsedMs,
          source: noFreshLocationCafe.payload.source,
          openAiStatus: noFreshLocationCafe.payload.agentRuntime?.openAiStatus,
          freshCurrentLocationRequired: noFreshLocationCafe.payload.contextSummary?.freshCurrentLocationRequired
        },
        tripNature: {
          elapsedMs: tripNature.elapsedMs,
          source: tripNature.payload.source,
          openAiStatus: tripNature.payload.agentRuntime?.openAiStatus
        },
        lodgingOrder: {
          elapsedMs: lodgingOrder.elapsedMs,
          source: lodgingOrder.payload.source,
          openAiStatus: lodgingOrder.payload.agentRuntime?.openAiStatus
        },
        athensLodgingCorrection: {
          elapsedMs: athensLodgingCorrection.elapsedMs,
          source: athensLodgingCorrection.payload.source,
          openAiStatus: athensLodgingCorrection.payload.agentRuntime?.openAiStatus
        },
        actionableYouCan: {
          elapsedMs: actionableYouCan.elapsedMs,
          source: actionableYouCan.payload.source,
          openAiStatus: actionableYouCan.payload.agentRuntime?.openAiStatus
        },
        broadTravelContext: {
          elapsedMs: broadTravelContext.elapsedMs,
          source: broadTravelContext.payload.source,
          openAiStatus: broadTravelContext.payload.agentRuntime?.openAiStatus
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
