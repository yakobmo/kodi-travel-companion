import type { AgentMessageRequest, AgentMessageResponse } from "./kodi.js";

export interface AgentToolEvidence {
  tripPlaces: {
    status: "not_run" | "ready";
    query?: string;
    matchedPlaceIds: string[];
  };
  route: {
    status: "not_run" | "ready" | "failed";
  };
  placesSearch: {
    status: "not_run" | "ready" | "failed";
  };
  memberLocations: {
    status: "not_run" | "ready";
  };
  persistentMemory: {
    status: "unavailable" | "ready";
  };
  stateMutation: {
    status: "unavailable" | "ready";
  };
}

export function buildAgentToolEvidence(input: AgentMessageRequest): AgentToolEvidence {
  return {
    tripPlaces: {
      status: input.tripSearchExecuted ? "ready" : "not_run",
      query: input.tripLookupResult?.query,
      matchedPlaceIds: input.tripLookupResult?.matches.map((place) => place.id) ?? []
    },
    route: {
      status: input.routePlan?.status === "ready" || (input.routeEstimate?.status === "ready" && Boolean(input.routeEstimate.route))
        ? "ready"
        : input.routeEstimate
          ? "failed"
          : "not_run"
    },
    placesSearch: {
      status: input.externalPlacesSearch?.status === "ready"
        ? "ready"
        : input.externalPlacesSearch
          ? "failed"
          : "not_run"
    },
    memberLocations: {
      status: input.memberLocationResult ? "ready" : "not_run"
    },
    persistentMemory: {
      status: "unavailable"
    },
    stateMutation: {
      status: input.stateMutationResult?.status === "completed" ? "ready" : "unavailable"
    }
  };
}

export function validateAgentEvidenceClaims(reply: AgentMessageResponse, evidence: AgentToolEvidence) {
  if (reply.metadata?.toolRequest) return;

  const text = reply.text.toLocaleLowerCase("he");
  const claimsRouteWasChecked =
    /(?:בדקתי|חישבתי|הרצתי|לפי)\s+(?:עכשיו\s+)?(?:ב|את|דרך|ה־)?(?:google\s*)?(?:routes?|מסלול|מפות)/iu.test(text) ||
    /(?:google\s*(?:maps|routes)|גוגל\s*מפות)\s+(?:מראה|מראה ש|נתן|החזיר)/iu.test(text);
  if (claimsRouteWasChecked && evidence.route.status !== "ready") {
    throw new Error("ai_reply_claims_unexecuted_route_tool");
  }

  const claimsMeasuredDuration = /(?:\d[\d.,]*\s*(?:שעות?|דקות?|minutes?|hours?))/iu.test(text);
  const claimsMeasuredDistance = /(?:\d[\d.,]*\s*(?:ק(?:י)?לומטר(?:ים)?|ק[״"]?מ|km))/iu.test(text);
  const distanceValuePattern = String.raw`\d[\d.,]*\s*(?:ק(?:י)?לומטר(?:ים)?|ק[״"]?מ|km)`;
  const travelQualifierPattern = String.raw`(?:נסיעה|כביש|הליכה|driving|walking|road)`;
  const characterizesTravelDistance = new RegExp(
    `(?:${travelQualifierPattern}.{0,30}${distanceValuePattern}|${distanceValuePattern}.{0,30}${travelQualifierPattern})`,
    "iu"
  ).test(text);
  const hasGeometricDistanceEvidence = evidence.tripPlaces.status === "ready";
  if (
    evidence.route.status !== "ready" &&
    (
      claimsMeasuredDuration ||
      (claimsMeasuredDistance && (!hasGeometricDistanceEvidence || characterizesTravelDistance))
    )
  ) {
    throw new Error("ai_reply_unverified_route_measurement");
  }

  const claimsACompletedCheck = /(?:בדקתי|אימתתי|וידאתי|מאומת(?:ת|ים|ות)?|נבדק(?:ה|ו)?)/iu.test(text);
  const hasCompletedEvidence =
    evidence.tripPlaces.status === "ready" ||
    evidence.route.status === "ready" ||
    evidence.placesSearch.status === "ready" ||
    evidence.memberLocations.status === "ready" ||
    evidence.stateMutation.status === "ready";
  if (claimsACompletedCheck && !hasCompletedEvidence) {
    throw new Error("ai_reply_claims_unexecuted_check");
  }

  const claimsPersistentMemory =
    /(?:אימצתי|שמרתי|קיבעתי).{0,30}(?:כלל|קבוע|לתמיד|בזיכרון)/iu.test(text) ||
    /(?:מעכשיו|בעתיד).{0,35}(?:תמיד|כלל קבוע|אזכור)/iu.test(text);
  if (claimsPersistentMemory && evidence.persistentMemory.status !== "ready") {
    throw new Error("ai_reply_claims_unavailable_persistent_memory");
  }

  const claimsStateWasChanged =
    /(?:הזזתי|אני\s+מזיז|שיניתי|עדכנתי|הוספתי|הכנסתי|סימנתי|קבעתי|יצרתי|מחקתי|העברתי)/iu.test(text) ||
    /(?:בוצע|סודר|עודכן|נשמר|נמחק|הועבר).{0,45}(?:במפה|בנקודות|במקומות|במערכת|בטיול)/iu.test(text);
  if (claimsStateWasChanged && evidence.stateMutation.status !== "ready") {
    throw new Error("ai_reply_claims_unexecuted_state_mutation");
  }
}
