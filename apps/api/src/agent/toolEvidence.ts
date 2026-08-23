import type { AgentMessageRequest, AgentMessageResponse } from "./kodi.js";

export interface AgentToolEvidence {
  tripMemory: {
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
    tripMemory: {
      status: input.tripLookupResult ? "ready" : "not_run",
      query: input.tripLookupResult?.query,
      matchedPlaceIds: input.tripLookupResult?.matches.map((place) => place.id) ?? []
    },
    route: {
      status: input.routeEstimate?.status === "ready" && Boolean(input.routeEstimate.route)
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
