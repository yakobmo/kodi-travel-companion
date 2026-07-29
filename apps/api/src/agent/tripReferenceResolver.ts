import type { TripPlace, TripState } from "../domain/types.js";

type ResolvedCoordinate = {
  lat: number;
  lng: number;
  label: string;
  source:
    | "live_member_location"
    | "group_destination"
    | "named_place"
    | "first_lodging"
    | "active_route_stop"
    | "first_known_place";
};

export interface TripReferenceResolution {
  confidence: "high" | "medium" | "low";
  reason: string;
  origin?: ResolvedCoordinate;
  destination?: ResolvedCoordinate;
  clarificationQuestion?: string;
}

function hasCoordinates(value: { lat?: number; lng?: number } | null | undefined): value is { lat: number; lng: number } {
  return typeof value?.lat === "number" && typeof value.lng === "number";
}

function normalize(text: string) {
  return text.toLowerCase().replace(/["']/g, "").replace(/\s+/g, " ").trim();
}

function toCoordinate(place: TripPlace, source: ResolvedCoordinate["source"]): ResolvedCoordinate {
  return {
    lat: Number(place.lat),
    lng: Number(place.lng),
    label: place.name,
    source
  };
}

function resolveOrigin(tripState: TripState): ResolvedCoordinate | undefined {
  const liveMember = tripState.members.find((item) => item.consent.state === "enabled" && item.liveLocation);
  if (liveMember?.liveLocation) {
    return {
      lat: liveMember.liveLocation.lat,
      lng: liveMember.liveLocation.lng,
      label: liveMember.member.displayName,
      source: "live_member_location"
    };
  }

  if (hasCoordinates(tripState.groupDestination)) {
    return {
      lat: tripState.groupDestination.lat,
      lng: tripState.groupDestination.lng,
      label: tripState.groupDestination.placeName,
      source: "group_destination"
    };
  }

  const firstPlace = [...tripState.places]
    .filter(hasCoordinates)
    .sort((first, second) => (first.sourceIndex ?? 0) - (second.sourceIndex ?? 0))[0];
  return firstPlace ? toCoordinate(firstPlace, "first_known_place") : undefined;
}

function findNamedPlace(message: string, tripState: TripState) {
  const normalizedMessage = normalize(message);
  return tripState.places
    .filter(hasCoordinates)
    .filter((place) => {
      const normalizedName = normalize(place.name);
      return normalizedName.length >= 4 && normalizedMessage.includes(normalizedName);
    })
    .sort((first, second) => normalize(second.name).length - normalize(first.name).length)[0];
}

function asksForFirstLodging(message: string) {
  const normalized = normalize(message);
  return [
    "\u05d4\u05de\u05dc\u05d5\u05df \u05d4\u05e8\u05d0\u05e9\u05d5\u05df",
    "\u05dc\u05d9\u05dc\u05d4 \u05e8\u05d0\u05e9\u05d5\u05df",
    "first hotel",
    "first lodging"
  ].some((term) => normalized.includes(term));
}

function rejectsActiveDestination(message: string) {
  const normalized = normalize(message);
  return [
    "\u05dc\u05d0 \u05d4\u05d9\u05e2\u05d3",
    "\u05d9\u05e2\u05d3 \u05d0\u05d7\u05e8",
    "\u05d4\u05ea\u05db\u05d5\u05d5\u05e0\u05ea\u05d9",
    "not the destination",
    "another destination",
    "i meant"
  ].some((term) => normalized.includes(term));
}

export function resolveTripReferenceForMessage(message: string, tripState: TripState): TripReferenceResolution {
  const origin = resolveOrigin(tripState);
  if (!origin) {
    return {
      confidence: "low",
      reason: "No origin is available in the active trip.",
      clarificationQuestion: "מאיזו נקודה בטיול לצאת?"
    };
  }

  const namedPlace = findNamedPlace(message, tripState);
  if (namedPlace) {
    return {
      origin,
      destination: toCoordinate(namedPlace, "named_place"),
      confidence: "high",
      reason: "Matched a place name from the active trip."
    };
  }

  if (asksForFirstLodging(message)) {
    const firstLodging = [...tripState.places]
      .filter((place) => place.type === "lodging" && hasCoordinates(place))
      .sort((first, second) => (first.sourceIndex ?? 0) - (second.sourceIndex ?? 0))[0];
    if (firstLodging) {
      return {
        origin,
        destination: toCoordinate(firstLodging, "first_lodging"),
        confidence: "high",
        reason: "Resolved the first lodging from active map order."
      };
    }
  }

  if (hasCoordinates(tripState.groupDestination) && !rejectsActiveDestination(message)) {
    return {
      origin,
      destination: {
        lat: tripState.groupDestination.lat,
        lng: tripState.groupDestination.lng,
        label: tripState.groupDestination.placeName,
        source: "group_destination"
      },
      confidence: "medium",
      reason: "Used the active group destination."
    };
  }

  const activeStop = tripState.groupRoute?.stops[tripState.groupRoute.activeStopIndex];
  if (hasCoordinates(activeStop)) {
    return {
      origin,
      destination: {
        lat: activeStop.lat,
        lng: activeStop.lng,
        label: activeStop.placeName,
        source: "active_route_stop"
      },
      confidence: "medium",
      reason: "Used the active route stop."
    };
  }

  return {
    origin,
    confidence: "low",
    reason: "The current message does not identify a destination in the active trip.",
    clarificationQuestion: "לאיזו נקודה בטיול להתייחס?"
  };
}
