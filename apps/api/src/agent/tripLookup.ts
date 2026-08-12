import type { TripPlace, TripState } from "../domain/types.js";
import { buildTripTimelineFromGoogleMapOrder } from "./tripTimelineResolver.js";

export interface TripLookupResult {
  query: string;
  itinerary: Array<{
    order: number;
    lodging: Pick<TripPlace, "id" | "name" | "address" | "lat" | "lng" | "sourceIndex">;
    regionHints: string[];
    dateHints: string[];
  }>;
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

export function lookupTripContext(tripState: TripState, query: string): TripLookupResult {
  const queryTokens = tokens(query);
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
    .sort(
      (first, second) =>
        second.score - first.score ||
        (first.place.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (second.place.sourceIndex ?? Number.MAX_SAFE_INTEGER)
    )
    // The trip is a small, trusted private corpus. Keep lexical matches first,
    // but also return the remaining directory so a Hebrew/English wording gap
    // cannot hide an airport, lodging, or saved point from the model.
    .slice(0, 60)
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

  return {
    query,
    itinerary: buildTripTimelineFromGoogleMapOrder(tripState).map((segment) => ({
      order: segment.index + 1,
      lodging: segment.lodging,
      regionHints: segment.regionHints,
      dateHints: segment.dateHints
    })),
    matches
  };
}
