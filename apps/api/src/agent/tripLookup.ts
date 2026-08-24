import type { TripPlace, TripState } from "../domain/types.js";
import { buildTripTimelineFromGoogleMapOrder } from "./tripTimelineResolver.js";
import { buildTripStayCalendar, type TripStayNight } from "./stayCalendar.js";

export interface TripLookupResult {
  query: string;
  itinerary: Array<{
    order: number;
    lodging: Pick<TripPlace, "id" | "name" | "address" | "lat" | "lng" | "sourceIndex">;
    regionHints: string[];
    dateHints: string[];
    checkIn?: string;
    checkOut?: string;
    nights: number;
  }>;
  stayCalendar: TripStayNight[];
  matches: Array<Pick<TripPlace, "id" | "name" | "type" | "address" | "lat" | "lng" | "note" | "tags" | "sourceIndex"> & {
    distanceFromReferenceMeters?: number;
  }>;
  totalMatches?: number;
  referencePlace?: Pick<TripPlace, "id" | "name" | "lat" | "lng">;
}

export interface TripPlaceSearchOptions {
  query?: string;
  placeTypes?: string[];
  referencePlaceId?: string;
  radiusMeters?: number;
  limit?: number;
}

function tokens(text: string) {
  return Array.from(
    new Set(
      text
        .toLocaleLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((token) => token.length >= 2)
    )
  );
}

export function lookupTripContext(tripState: TripState, query: string, placeIds: string[] = []): TripLookupResult {
  const queryTokens = tokens(query);
  const requestedIds = new Set(placeIds.slice(0, 12));
  const matches = tripState.places
    .map((place) => {
      const searchable = [place.name, place.type, place.address, place.note, ...(place.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      return {
        place,
        score: queryTokens.reduce((score, token) => score + (searchable.includes(token) ? 1 : 0), 0)
      };
    })
    .filter((item) => requestedIds.has(item.place.id) || item.score > 0)
    .sort(
      (first, second) =>
        Number(requestedIds.has(second.place.id)) - Number(requestedIds.has(first.place.id)) ||
        second.score - first.score ||
        (first.place.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (second.place.sourceIndex ?? Number.MAX_SAFE_INTEGER)
    )
    .slice(0, 12)
    .map(({ place }) => ({
      id: place.id,
      name: place.name,
      type: place.type,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      note: place.note,
      tags: place.tags,
      sourceIndex: place.sourceIndex
    }));

  const timelineByLodgingId = new Map(buildTripTimelineFromGoogleMapOrder(tripState).map((segment) => [segment.lodging.id, segment]));
  const stayCalendar = buildTripStayCalendar(tripState);

  return {
    query,
    itinerary: stayCalendar.stays.map((stay, index) => ({
      order: index + 1,
      lodging: stay.lodging,
      regionHints: timelineByLodgingId.get(stay.lodging.id)?.regionHints ?? [],
      dateHints: timelineByLodgingId.get(stay.lodging.id)?.dateHints ?? [],
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      nights: stay.nights
    })),
    stayCalendar: stayCalendar.nights,
    matches
  };
}

function distanceMeters(first: { lat: number; lng: number }, second: { lat: number; lng: number }) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = radians(second.lat - first.lat);
  const lngDelta = radians(second.lng - first.lng);
  const firstLat = radians(first.lat);
  const secondLat = radians(second.lat);
  const value =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lngDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function searchTripPlaces(tripState: TripState, options: TripPlaceSearchOptions): TripLookupResult {
  const query = options.query?.trim() ?? "";
  const queryTokens = tokens(query);
  const normalizedTypes = new Set((options.placeTypes ?? []).map((value) => value.toLocaleLowerCase()));
  const reference = options.referencePlaceId
    ? tripState.places.find((place) => place.id === options.referencePlaceId)
    : undefined;
  const hasReference = reference && typeof reference.lat === "number" && typeof reference.lng === "number";
  const limit = Math.min(Math.max(Math.round(options.limit ?? 20), 1), 60);

  const ranked = tripState.places
    .map((place) => {
      const searchable = [place.name, place.type, place.address, place.note, ...(place.tags ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();
      const score = queryTokens.reduce((total, token) => total + (searchable.includes(token) ? 1 : 0), 0);
      const distance = hasReference && typeof place.lat === "number" && typeof place.lng === "number"
        ? distanceMeters(
            { lat: reference.lat as number, lng: reference.lng as number },
            { lat: place.lat, lng: place.lng }
          )
        : undefined;
      return { place, score, distance };
    })
    .filter(({ place, score, distance }) => {
      if (normalizedTypes.size > 0 && !normalizedTypes.has(place.type.toLocaleLowerCase())) return false;
      if (queryTokens.length > 0 && score === 0) return false;
      if (typeof options.radiusMeters === "number" && (distance === undefined || distance > options.radiusMeters)) return false;
      return true;
    })
    .sort((first, second) => {
      if (queryTokens.length > 0 && second.score !== first.score) return second.score - first.score;
      if (first.distance !== undefined && second.distance !== undefined && first.distance !== second.distance) {
        return first.distance - second.distance;
      }
      return (first.place.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (second.place.sourceIndex ?? Number.MAX_SAFE_INTEGER);
    });

  const base = lookupTripContext(tripState, query || "saved trip places");
  return {
    ...base,
    matches: ranked.slice(0, limit).map(({ place, distance }) => ({
      id: place.id,
      name: place.name,
      type: place.type,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      note: place.note,
      tags: place.tags,
      sourceIndex: place.sourceIndex,
      distanceFromReferenceMeters: distance === undefined ? undefined : Math.round(distance)
    })),
    totalMatches: ranked.length,
    referencePlace: hasReference
      ? { id: reference.id, name: reference.name, lat: reference.lat as number, lng: reference.lng as number }
      : undefined
  };
}
