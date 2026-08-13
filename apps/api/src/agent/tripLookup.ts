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
  matches: Array<Pick<TripPlace, "id" | "name" | "type" | "address" | "lat" | "lng" | "note" | "tags" | "sourceIndex">>;
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
