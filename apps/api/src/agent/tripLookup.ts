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

function scheduledDateOrder(note: string | undefined) {
  const normalized = (note ?? "").toLocaleLowerCase();
  const numeric = normalized.match(/(?:^|\D)(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\D|$)/u);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) return month * 32 + day;
  }

  const namedMonths: Array<[RegExp, number]> = [
    [/(\d{1,2})\s*(?:ב|ל)?אוגוסט|(?:august|aug)\s*(\d{1,2})/iu, 8],
    [/(\d{1,2})\s*(?:ב|ל)?ספטמבר|(?:september|sep)\s*(\d{1,2})/iu, 9]
  ];
  for (const [pattern, month] of namedMonths) {
    const match = normalized.match(pattern);
    const day = Number(match?.[1] ?? match?.[2]);
    if (day >= 1 && day <= 31) return month * 32 + day;
  }
  return Number.MAX_SAFE_INTEGER;
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

  const itinerary = buildTripTimelineFromGoogleMapOrder(tripState)
    .map((segment) => ({
      segment,
      savedLodging: tripState.places.find((place) => place.id === segment.lodging.id)
    }))
    .sort(
      (first, second) =>
        scheduledDateOrder(first.savedLodging?.note) - scheduledDateOrder(second.savedLodging?.note) ||
        first.segment.index - second.segment.index
    );

  return {
    query,
    itinerary: itinerary.map(({ segment }, index) => ({
      order: index + 1,
      lodging: segment.lodging,
      regionHints: segment.regionHints,
      dateHints: segment.dateHints
    })),
    matches
  };
}
