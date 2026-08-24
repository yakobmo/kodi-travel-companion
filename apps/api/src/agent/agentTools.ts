import type { AgentMessageResponse } from "./kodi.js";

export type KodiToolRequest =
  | { type: "trip_memory"; placeIds: string[] }
  | { type: "route"; stops: string[]; travelMode: "DRIVE" | "WALK" }
  | { type: "places_search"; query: string; anchorPlaceId?: string; radiusMeters: number }
  | { type: "member_locations"; scope: "all" | "member"; memberName?: string }
  | { type: "map_action"; placeIds: string[]; title?: string };

export const KODI_TOOL_CONTRACT =
  "Use the available tools whenever an answer depends on saved trip details, geographic facts, live place data, route comparison, member location, or a map action. " +
  "Choose tools from their descriptions, use IDs exposed by placeDirectory or prior tool results, and continue through as many tool steps as the task genuinely needs before answering. " +
  "The request payload's currentLocation is already the active requester's verified location; use it as the anchor for a nearby places_search and never try to rediscover it through member_locations. " +
  "General knowledge is not evidence for measurements, current facts, private state, or completed actions.";

export const KODI_OPENAI_TOOLS = [
  {
    type: "function",
    function: {
      name: "trip_memory",
      description: "Retrieve full saved details for selected trip places.",
      parameters: {
        type: "object",
        properties: { placeIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 12 } },
        required: ["placeIds"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "route",
      description:
        "Calculate a verified Google route through 2-6 ordered stops. Each stop may be an exact ID from placeDirectory/externalPlacesSearch or a natural Google place query when the desired stop is not saved. Preserve every stop the user requested; never substitute an unrelated saved place.",
      parameters: {
        type: "object",
        properties: {
          stops: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 6 },
          travelMode: { type: "string", enum: ["DRIVE", "WALK"] }
        },
        required: ["stops", "travelMode"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "places_search",
      description:
        "Search live Google Places results, including nearby venues, ratings, reviews, and current place facts. Results include alreadySaved and savedMatch computed by the server against the trip map. For a nearby search, the server anchors this tool to the request payload's verified currentLocation or to anchorPlaceId.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          anchorPlaceId: { type: "string" },
          radiusMeters: { type: "number", minimum: 500, maximum: 50000 }
        },
        required: ["query"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "member_locations",
      description:
        "Read consent-authorized locations of trip-group members when the user asks where another member or the group is. Do not use this to discover the active requester's currentLocation or to search for nearby venues.",
      parameters: {
        type: "object",
        properties: {
          scope: { type: "string", enum: ["all", "member"] },
          memberName: { type: "string" }
        },
        required: ["scope"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "map_action",
      description:
        "Mark one or more saved trip places on the shared in-app Google map. Use only when the user asks to mark, show, or create a map/route; this is an operational action enforced by server permissions.",
      parameters: {
        type: "object",
        properties: {
          placeIds: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
          title: { type: "string", maxLength: 120 }
        },
        required: ["placeIds"],
        additionalProperties: false
      }
    }
  }
] as const;

export function parseOpenAiKodiToolCall(value: unknown): KodiToolRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const call = value as { function?: { name?: unknown; arguments?: unknown } };
  if (typeof call.function?.name !== "string" || typeof call.function.arguments !== "string") return undefined;
  try {
    const args = JSON.parse(call.function.arguments) as Record<string, unknown>;
    return parseKodiToolRequest({ type: call.function.name, ...args });
  } catch {
    return undefined;
  }
}

export function parseKodiToolRequest(value: unknown): KodiToolRequest | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;

  if (candidate.type === "route") {
    const legacyPlaceIds =
      typeof candidate.originPlaceId === "string" && typeof candidate.destinationPlaceId === "string"
        ? [candidate.originPlaceId, candidate.destinationPlaceId]
        : [];
    const stops = (Array.isArray(candidate.stops) ? candidate.stops : Array.isArray(candidate.placeIds) ? candidate.placeIds : legacyPlaceIds)
      .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      .map((id) => id.trim())
      .slice(0, 6);
    if (stops.length < 2 || stops.some((id, index) => index > 0 && id === stops[index - 1])) return undefined;
    return {
      type: "route",
      stops,
      travelMode: candidate.travelMode === "WALK" ? "WALK" : "DRIVE"
    };
  }

  if (candidate.type === "places_search" && typeof candidate.query === "string" && candidate.query.trim().length >= 3) {
    return {
      type: "places_search",
      query: candidate.query.trim().slice(0, 300),
      anchorPlaceId: typeof candidate.anchorPlaceId === "string" ? candidate.anchorPlaceId : undefined,
      radiusMeters:
        typeof candidate.radiusMeters === "number"
          ? Math.min(Math.max(Math.round(candidate.radiusMeters), 500), 50_000)
          : 20_000
    };
  }

  if (candidate.type === "trip_memory" && Array.isArray(candidate.placeIds)) {
    const placeIds = candidate.placeIds
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .slice(0, 12);
    return placeIds.length > 0 ? { type: "trip_memory", placeIds } : undefined;
  }

  if (candidate.type === "member_locations") {
    return {
      type: "member_locations",
      scope: candidate.scope === "member" ? "member" : "all",
      memberName:
        typeof candidate.memberName === "string" && candidate.memberName.trim()
          ? candidate.memberName.trim().slice(0, 100)
          : undefined
    };
  }

  if (candidate.type === "map_action" && Array.isArray(candidate.placeIds)) {
    const placeIds = Array.from(
      new Set(candidate.placeIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))
    ).slice(0, 6);
    return placeIds.length > 0
      ? {
          type: "map_action",
          placeIds,
          title:
            typeof candidate.title === "string" && candidate.title.trim()
              ? candidate.title.trim().slice(0, 120)
              : undefined
        }
      : undefined;
  }

  return undefined;
}

export function getKodiToolRequest(reply: AgentMessageResponse | undefined) {
  return parseKodiToolRequest(reply?.metadata?.toolRequest);
}
