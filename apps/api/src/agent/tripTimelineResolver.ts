import type { PlaceType, TripPlace, TripState } from "../domain/types.js";

export type TripTimelineConfidence = "high" | "medium" | "low";

export interface TripTimelineSegment {
  segmentId: string;
  index: number;
  title: string;
  source: "google_map_order_lodging_segments";
  confidence: TripTimelineConfidence;
  lodging: Pick<TripPlace, "id" | "name" | "address" | "lat" | "lng" | "note" | "sourceIndex">;
  startSourceIndex: number;
  endSourceIndex: number;
  dateHints: string[];
  regionHints: string[];
  nearbyPlacesCount: number;
  placeTypeCounts: Partial<Record<PlaceType, number>>;
}

export interface TripTimelineResolution {
  confidence: TripTimelineConfidence;
  reason: string;
  segment?: TripTimelineSegment;
  referenceLocation?: {
    lat: number;
    lng: number;
    label: string;
    source: "timeline_lodging";
  };
}

const REGION_ALIASES: Record<string, string[]> = {
  pelion: ["pelion", "pilion", "\u05e4\u05d9\u05dc\u05d9\u05d5\u05df"],
  zagori: ["zagori", "zagoroxoria", "papigo", "aristi", "voidomatis", "vikos"],
  meteora: ["meteora", "kalabaka"],
  tzoumerka: ["tzoumerka", "pramanta", "arta"],
  athens: ["athens", "athina"],
  edessa: ["edessa"],
  olympus: ["olympus"]
};

function hasCoordinates(value: { lat?: number; lng?: number } | null | undefined): value is { lat: number; lng: number } {
  return typeof value?.lat === "number" && typeof value.lng === "number";
}

function distanceMeters(first: { lat: number; lng: number }, second: { lat: number; lng: number }) {
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(second.lat - first.lat);
  const deltaLng = toRadians(second.lng - first.lng);
  const firstLat = toRadians(first.lat);
  const secondLat = toRadians(second.lat);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function placeText(place: TripPlace) {
  return `${place.name} ${place.address ?? ""} ${place.note ?? ""}`.toLowerCase();
}

function detectDateHints(place: TripPlace) {
  const text = `${place.note ?? ""} ${place.name ?? ""}`;
  const hints = new Set<string>();

  for (const match of text.matchAll(/\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/g)) {
    hints.add(match[0]);
  }

  return Array.from(hints);
}

function detectRegionHints(places: TripPlace[]) {
  const text = places.map(placeText).join(" ");
  return Object.entries(REGION_ALIASES)
    .filter(([, aliases]) => aliases.some((alias) => text.includes(alias)))
    .map(([region]) => region);
}

function countTypes(places: TripPlace[]) {
  return places.reduce<Partial<Record<PlaceType, number>>>((acc, place) => {
    acc[place.type] = (acc[place.type] ?? 0) + 1;
    return acc;
  }, {});
}

function getVisibleOrigin(tripState: TripState) {
  const visibleMember = tripState.members.find((item) => item.consent.state === "enabled" && item.liveLocation);

  if (visibleMember?.liveLocation) {
    return {
      lat: visibleMember.liveLocation.lat,
      lng: visibleMember.liveLocation.lng
    };
  }

  if (hasCoordinates(tripState.groupDestination)) {
    return {
      lat: tripState.groupDestination.lat,
      lng: tripState.groupDestination.lng
    };
  }

  return undefined;
}

export function buildTripTimelineFromGoogleMapOrder(tripState: TripState): TripTimelineSegment[] {
  const placesBySourceIndex = [...tripState.places].sort(
    (first, second) => (first.sourceIndex ?? 0) - (second.sourceIndex ?? 0)
  );
  const lodgings = placesBySourceIndex.filter((place) => place.type === "lodging" && hasCoordinates(place));

  return lodgings.map((lodging, index) => {
    const lodgingCoordinate = { lat: Number(lodging.lat), lng: Number(lodging.lng) };
    const startSourceIndex = lodging.sourceIndex ?? index;
    const nextSourceIndex = lodgings[index + 1]?.sourceIndex ?? Number.POSITIVE_INFINITY;
    const placesInMapOrderSegment = placesBySourceIndex.filter((place) => {
      const sourceIndex = place.sourceIndex ?? 0;
      return sourceIndex >= startSourceIndex && sourceIndex < nextSourceIndex;
    });
    const nearbyPlaces = placesBySourceIndex.filter(
      (place) =>
        hasCoordinates(place) &&
        distanceMeters(lodgingCoordinate, { lat: place.lat, lng: place.lng }) <= 65000 &&
        !placesInMapOrderSegment.some((segmentPlace) => segmentPlace.id === place.id)
    );
    const associatedPlaces = [...placesInMapOrderSegment, ...nearbyPlaces.slice(0, 12)];
    const dateHints = Array.from(new Set(associatedPlaces.flatMap(detectDateHints)));
    const regionHints = detectRegionHints(associatedPlaces);

    return {
      segmentId: `timeline_segment_${index + 1}`,
      index,
      title: `${index + 1}. ${lodging.name}`,
      source: "google_map_order_lodging_segments",
      confidence: dateHints.length > 0 || regionHints.length > 0 ? "medium" : "low",
      lodging: {
        id: lodging.id,
        name: lodging.name,
        address: lodging.address,
        lat: lodging.lat,
        lng: lodging.lng,
        note: lodging.note,
        sourceIndex: lodging.sourceIndex
      },
      startSourceIndex,
      endSourceIndex: Number.isFinite(nextSourceIndex) ? nextSourceIndex - 1 : startSourceIndex,
      dateHints,
      regionHints,
      nearbyPlacesCount: associatedPlaces.length,
      placeTypeCounts: countTypes(associatedPlaces)
    };
  });
}

function detectRequestedRegion(message: string) {
  const normalized = message.toLowerCase();

  return Object.entries(REGION_ALIASES).find(([, aliases]) => aliases.some((alias) => normalized.includes(alias)))?.[0];
}

function detectRelativeDays(message: string) {
  const normalized = message.toLowerCase();
  const explicit = normalized.match(/(?:in|after)\s+(\d+)\s+days/);

  if (explicit) {
    return Number(explicit[1]);
  }

  if (normalized.includes("\u05de\u05d7\u05e8")) {
    return 1;
  }

  if (normalized.includes("\u05e2\u05d5\u05d3 \u05d9\u05d5\u05de\u05d9\u05d9\u05dd")) {
    return 2;
  }

  return undefined;
}

function findCurrentSegmentIndex(tripState: TripState, timeline: TripTimelineSegment[]) {
  const origin = getVisibleOrigin(tripState);

  if (!origin) {
    return -1;
  }

  return timeline
    .map((segment) => ({
      index: segment.index,
      distanceMeters: hasCoordinates(segment.lodging)
        ? distanceMeters(origin, { lat: segment.lodging.lat, lng: segment.lodging.lng })
        : Number.POSITIVE_INFINITY
    }))
    .sort((first, second) => first.distanceMeters - second.distanceMeters)[0]?.index ?? -1;
}

export function resolveTimelineReferenceForMessage(message: string, tripState: TripState): TripTimelineResolution {
  const timeline = buildTripTimelineFromGoogleMapOrder(tripState);
  const requestedRegion = detectRequestedRegion(message);

  if (requestedRegion) {
    const regionMatches = timeline.filter((segment) => segment.regionHints.includes(requestedRegion));
    const match = regionMatches[0];

    if (match && hasCoordinates(match.lodging)) {
      return {
        confidence: regionMatches.length === 1 ? "high" : "medium",
        reason: `Matched requested region '${requestedRegion}' to a Google map lodging segment.`,
        segment: match,
        referenceLocation: {
          lat: match.lodging.lat,
          lng: match.lodging.lng,
          label: match.lodging.name,
          source: "timeline_lodging"
        }
      };
    }
  }

  const relativeDays = detectRelativeDays(message);
  if (relativeDays !== undefined) {
    const currentIndex = findCurrentSegmentIndex(tripState, timeline);
    const match = timeline[currentIndex + relativeDays];

    if (match && hasCoordinates(match.lodging)) {
      return {
        confidence: "medium",
        reason: `Resolved relative day offset ${relativeDays} from the nearest current lodging segment.`,
        segment: match,
        referenceLocation: {
          lat: match.lodging.lat,
          lng: match.lodging.lng,
          label: match.lodging.name,
          source: "timeline_lodging"
        }
      };
    }
  }

  return {
    confidence: "low",
    reason: "No future trip segment or region reference was clear enough from the imported Google map order."
  };
}
