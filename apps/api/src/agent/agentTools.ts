import type { AgentMessageResponse } from "./kodi.js";

export type KodiToolRequest =
  | { type: "trip_memory"; placeIds: string[] }
  | { type: "route"; originPlaceId: string; destinationPlaceId: string; travelMode: "DRIVE" | "WALK" }
  | { type: "places_search"; query: string; anchorPlaceId?: string; radiusMeters: number }
  | { type: "member_locations"; scope: "all" | "member"; memberName?: string }
  | { type: "map_action"; placeIds: string[]; title?: string };

export const KODI_TOOL_CONTRACT =
  "Use the available tools whenever an answer depends on saved trip details, geographic facts, live place data, route comparison, member location, or a map action. " +
  "Choose tools from their descriptions, request one at a time with exact place IDs from placeDirectory, and synthesize the result before answering. " +
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
      description: "Calculate a verified Google route between two saved trip places.",
      parameters: {
        type: "object",
        properties: {
          originPlaceId: { type: "string" },
          destinationPlaceId: { type: "string" },
          travelMode: { type: "string", enum: ["DRIVE", "WALK"] }
        },
        required: ["originPlaceId", "destinationPlaceId", "travelMode"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "places_search",
      description: "Search live Google Places results, including nearby venues and current place facts.",
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
      description: "Read consent-authorized current locations for trip members.",
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
    if (
      typeof candidate.originPlaceId !== "string" ||
      typeof candidate.destinationPlaceId !== "string" ||
      candidate.originPlaceId === candidate.destinationPlaceId
    ) return undefined;
    return {
      type: "route",
      originPlaceId: candidate.originPlaceId,
      destinationPlaceId: candidate.destinationPlaceId,
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
