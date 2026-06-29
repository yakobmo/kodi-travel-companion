import type { TripPlace, TripState } from "../domain/types.js";

export type TripContextConfidence = "high" | "medium" | "low";

export interface ResolvedCoordinate {
  lat: number;
  lng: number;
  label?: string;
  source: "live_member_location" | "group_destination" | "nearest_lodging" | "active_route_stop" | "first_known_place";
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
  const origin = getOrigin(tripState);
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
    const activeDestinationPlace = tripState.places.find(
      (place) =>
        place.id === tripState.groupDestination?.placeId &&
        place.type === "lodging" &&
        hasCoordinates(place)
    );

    if (activeDestinationPlace) {
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
