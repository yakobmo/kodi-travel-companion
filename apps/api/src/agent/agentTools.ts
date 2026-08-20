import type { AgentMessageResponse } from "./kodi.js";

export type KodiToolRequest =
  | { type: "trip_memory"; placeIds: string[] }
  | { type: "route"; originPlaceId: string; destinationPlaceId: string; travelMode: "DRIVE" | "WALK" }
  | { type: "places_search"; query: string; anchorPlaceId?: string; radiusMeters: number }
  | { type: "member_locations"; scope: "all" | "member"; memberName?: string };

export const KODI_TOOL_CONTRACT =
  "Available tools: trip_memory(placeIds), route(originPlaceId,destinationPlaceId,travelMode), " +
  "places_search(query,anchorPlaceId?,radiusMeters?), and member_locations(scope,memberName?). " +
  "Request at most one tool at a time through toolRequest, using exact place IDs from placeDirectory.";

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

  return undefined;
}

export function getKodiToolRequest(reply: AgentMessageResponse | undefined) {
  return parseKodiToolRequest(reply?.metadata?.toolRequest);
}

