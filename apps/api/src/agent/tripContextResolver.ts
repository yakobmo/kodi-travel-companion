import type { TripPlace, TripState } from "../domain/types.js";

export type TripContextConfidence = "high" | "medium" | "low";

export interface ResolvedCoordinate {
  lat: number;
  lng: number;
  label?: string;
  source:
    | "live_member_location"
    | "athens_airport"
    | "group_destination"
    | "named_lodging"
    | "nearest_lodging"
    | "active_route_stop"
    | "first_known_place";
}

export interface TripReferenceResolution {
  origin?: ResolvedCoordinate;
  destination?: ResolvedCoordinate;
  confidence: TripContextConfidence;
  reason: string;
  clarificationQuestion?: string;
}

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

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function normalizeText(text: string) {
  return text.toLowerCase().replace(/[׳״"']/g, "").replace(/\s+/g, " ").trim();
}

function mentionsAthensAirport(text: string) {
  const normalized = normalizeText(text);

  return includesAny(normalized, ["שדה התעופה", "נתבג אתונה", "נוחת", "נחיתה", "athens airport", "airport"]);
}

function getAthensAirport(tripState: TripState) {
  return tripState.places.find((place) => /airport|שדה|אתונה/i.test(`${place.name} ${place.address ?? ""}`) && hasCoordinates(place));
}

function findNamedLodging(message: string, tripState: TripState) {
  const normalized = normalizeText(message);
  const lodgingPlaces = tripState.places.filter((place) => place.type === "lodging" && hasCoordinates(place));

  if (
    includesAny(normalized, [
      "מארתה",
      "מאריתה",
      "מרתה",
      "מרתיה",
      "marathia",
      "hotel marathia",
      "המלון הראשון",
      "מלון ראשון",
      "לילה ראשון",
      "הלינה הראשונה",
      "first hotel",
      "first lodging"
    ])
  ) {
    return lodgingPlaces.find((place) => normalizeText(place.name).includes("marathia"));
  }

  return lodgingPlaces.find((place) => {
    const name = normalizeText(place.name);
    return name.length >= 4 && normalized.includes(name);
  });
}

function shouldIgnoreActiveDestination(message: string) {
  const normalized = normalizeText(message);

  return includesAny(normalized, [
    "אוורוף זה סוף",
    "averof זה סוף",
    "לא היעד הראשון",
    "יצאת מהשיחה",
    "נוחתים באתונה",
    "מלון ראשון",
    "המלון הראשון",
    "מאריתה",
    "מארתה",
    "marathia"
  ]);
}

function getOrigin(tripState: TripState): ResolvedCoordinate | undefined {
  const visibleMember = tripState.members.find((item) => item.consent.state === "enabled" && item.liveLocation);

  if (visibleMember?.liveLocation) {
    return {
      lat: visibleMember.liveLocation.lat,
      lng: visibleMember.liveLocation.lng,
      label: visibleMember.member.displayName,
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

  const firstPlace = tripState.places.find(hasCoordinates);
  if (!firstPlace) {
    return undefined;
  }

  return {
    lat: Number(firstPlace.lat),
    lng: Number(firstPlace.lng),
    label: firstPlace.name,
    source: "first_known_place"
  };
}

function toDestination(place: TripPlace, source: ResolvedCoordinate["source"]): ResolvedCoordinate {
  return {
    lat: Number(place.lat),
    lng: Number(place.lng),
    label: place.name,
    source
  };
}

function getNearestLodging(origin: ResolvedCoordinate, tripState: TripState) {
  return tripState.places
    .filter((place) => place.type === "lodging" && hasCoordinates(place))
    .map((place) => ({
      place,
      distanceMeters: distanceMeters(origin, { lat: Number(place.lat), lng: Number(place.lng) })
    }))
    .sort((first, second) => first.distanceMeters - second.distanceMeters);
}

export function resolveTripReferenceForMessage(message: string, tripState: TripState): TripReferenceResolution {
  const airport = mentionsAthensAirport(message) ? getAthensAirport(tripState) : undefined;
  const defaultOrigin = getOrigin(tripState);
  const origin = airport
    ? {
        lat: Number(airport.lat),
        lng: Number(airport.lng),
        label: airport.name,
        source: "athens_airport" as const
      }
    : defaultOrigin;
  const asksAboutLodging = includesAny(message, [
    "מלון",
    "בית מלון",
    "לינה",
    "hotel",
    "lodging",
    "׳׳׳•׳",
    "׳‘׳™׳× ׳׳׳•׳",
    "׳׳™׳ ׳”"
  ]);

  if (!origin) {
    return {
      confidence: "low",
      reason: "No current origin is available.",
      clarificationQuestion: "אין לי עדיין מיקום נוכחי אמין. לשלוח לי מיקום או לבחור נקודת מוצא מהמפה?"
    };
  }

  if (!asksAboutLodging && hasCoordinates(tripState.groupDestination)) {
    return {
      origin,
      destination: {
        lat: tripState.groupDestination.lat,
        lng: tripState.groupDestination.lng,
        label: tripState.groupDestination.placeName,
        source: "group_destination"
      },
      confidence: "high",
      reason: "Message refers to the active group destination."
    };
  }

  if (asksAboutLodging) {
    const namedLodging = findNamedLodging(message, tripState);
    if (namedLodging) {
      return {
        origin,
        destination: toDestination(namedLodging, "named_lodging"),
        confidence: "high",
        reason: "Resolved a named or first-night lodging reference from the message."
      };
    }

    const activeDestinationPlace = tripState.places.find(
      (place) =>
        place.id === tripState.groupDestination?.placeId &&
        place.type === "lodging" &&
        hasCoordinates(place)
    );

    if (activeDestinationPlace && !shouldIgnoreActiveDestination(message)) {
      return {
        origin,
        destination: toDestination(activeDestinationPlace, "group_destination"),
        confidence: "high",
        reason: "The active group destination is a lodging place."
      };
    }

    const lodgingByDistance = getNearestLodging(origin, tripState);
    const nearest = lodgingByDistance[0];
    const second = lodgingByDistance[1];

    if (!nearest) {
      return {
        origin,
        confidence: "low",
        reason: "No lodging place with coordinates exists.",
        clarificationQuestion: "אני לא מזהה מלון עם מיקום במפת הטיול. לאיזה מלון התכוונתם?"
      };
    }

    if (!second || nearest.distanceMeters < second.distanceMeters * 0.55) {
      return {
        origin,
        destination: toDestination(nearest.place, "nearest_lodging"),
        confidence: "medium",
        reason: "Selected the nearest lodging to the live/current location."
      };
    }

    return {
      origin,
      confidence: "low",
      reason: "Multiple lodging places are plausible from the current context.",
      clarificationQuestion: "רק לוודא: אתם מתכוונים למלון הנוכחי הקרוב אלינו, או למלון שאנחנו נוסעים אליו?"
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
      confidence: "high",
      reason: "Message falls back to the active route stop."
    };
  }

  return {
    origin,
    confidence: "low",
    reason: "No destination reference is clear enough.",
    clarificationQuestion: "לאיזו נקודה בטיול להתייחס עכשיו - היעד הפעיל, המלון, או מקום אחר מהמפה?"
  };
}
