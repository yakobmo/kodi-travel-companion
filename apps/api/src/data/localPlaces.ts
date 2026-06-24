import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PlaceType, TripPlace, TripPlacesSummary } from "../domain/types.js";

interface SourcePlace {
  id?: string;
  sourceIndex?: number;
  name?: string;
  note?: string;
  address?: string;
  lat?: number;
  lng?: number;
  googleIds?: string[];
  type?: string;
}

const DEMO_TRIP_ID = "trip_north_greece_demo";
const DEMO_GROUP_ID = "group_family_greece_demo";
const DEMO_SOURCE_ID = "source_google_maps_place_list_demo";

const placesPathCandidates = [
  process.env.TRIP_PLACES_JSON,
  path.resolve(process.cwd(), "work/spikes/google-place-list/out/places.json"),
  path.resolve(process.cwd(), "../work/spikes/google-place-list/out/places.json"),
  path.resolve(process.cwd(), "../../work/spikes/google-place-list/out/places.json"),
  path.resolve(process.cwd(), "../../../work/spikes/google-place-list/out/places.json")
].filter(Boolean) as string[];

function resolvePlacesPath() {
  const found = placesPathCandidates.find((candidate) => existsSync(candidate));

  if (!found) {
    throw new Error("Could not find local Google Maps places fixture.");
  }

  return found;
}

function normalizePlaceType(type: string | undefined): PlaceType {
  switch (type) {
    case "lodging":
    case "attraction":
    case "water":
    case "food":
    case "transport":
    case "stop":
      return type;
    default:
      return "unknown";
  }
}

function normalizeTags(source: SourcePlace, type: PlaceType) {
  const tags = new Set<string>();

  tags.add(type);

  if (source.note) {
    tags.add("note");
  }

  if (type === "lodging") {
    tags.add("׳׳™׳ ׳”");
  }

  if (type === "water") {
    tags.add("׳׳™׳");
  }

  return Array.from(tags);
}

export function loadDemoTripPlaces(): TripPlace[] {
  const sourcePath = resolvePlacesPath();
  const sourcePlaces = JSON.parse(readFileSync(sourcePath, "utf8")) as SourcePlace[];

  return sourcePlaces.map((source, index) => {
    const type = normalizePlaceType(source.type);

    return {
      id: source.id ?? `place_${index}`,
      tripId: DEMO_TRIP_ID,
      tripGroupId: DEMO_GROUP_ID,
      sourceId: DEMO_SOURCE_ID,
      sourcePlaceId: source.googleIds?.join(":") ?? source.id,
      sourceIndex: source.sourceIndex ?? index,
      name: source.name ?? "Unnamed place",
      type,
      address: source.address,
      lat: source.lat,
      lng: source.lng,
      note: source.note,
      tags: normalizeTags(source, type),
      visitState: "unvisited"
    };
  });
}

export function buildTripPlacesSummary(places: TripPlace[]): TripPlacesSummary {
  const byType = places.reduce<Record<string, number>>((acc, place) => {
    acc[place.type] = (acc[place.type] ?? 0) + 1;
    return acc;
  }, {});

  return {
    tripId: DEMO_TRIP_ID,
    tripGroupId: DEMO_GROUP_ID,
    total: places.length,
    byType,
    lodgingCount: byType.lodging ?? 0,
    waterCount: byType.water ?? 0
  };
}
