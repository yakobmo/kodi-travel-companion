import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PlaceType, TripPlace, TripPlacesSummary } from "../domain/types.js";
import { getActiveDemoStorageDriverName } from "./demoStorage.js";
import { DEMO_TRIP_GROUP_UUID } from "./demoRelationalIds.js";
import { ensureDemoRelationalBase } from "./demoRelationalSeed.js";
import { getDemoTripPlaceUuid } from "./demoRelationalPlaces.js";

export interface SourcePlace {
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

export interface RuntimeTripPlacesSource {
  label: string;
  sourceUrl: string;
  importedAt: string;
  places: SourcePlace[];
}

const DEMO_TRIP_ID = "trip_north_greece_demo";
const DEMO_GROUP_ID = "group_family_greece_demo";
export const DEMO_SOURCE_ID = "source_google_maps_place_list_demo";
export const DEMO_GOOGLE_SOURCE_URL = "https://maps.app.goo.gl/MspoN6j9CJDyGmtb8";

const placesPathCandidates = [
  process.env.TRIP_PLACES_JSON,
  path.resolve(process.cwd(), "data/demo-google-places.json"),
  path.resolve(process.cwd(), "../../data/demo-google-places.json"),
  path.resolve(process.cwd(), "work/spikes/google-place-list/out/places.json"),
  path.resolve(process.cwd(), "../work/spikes/google-place-list/out/places.json"),
  path.resolve(process.cwd(), "../../work/spikes/google-place-list/out/places.json"),
  path.resolve(process.cwd(), "../../../work/spikes/google-place-list/out/places.json")
].filter(Boolean) as string[];

let runtimeSyncedPlacesSource: RuntimeTripPlacesSource | undefined;

function resolvePlacesPath() {
  const found = placesPathCandidates.find((candidate) => existsSync(candidate));

  if (!found) {
    throw new Error("Could not find local Google Maps places fixture.");
  }

  return found;
}

export function getDemoTripPlacesSourcePath() {
  return resolvePlacesPath();
}

export function getRuntimeSyncedTripPlacesSource() {
  return runtimeSyncedPlacesSource;
}

export function setRuntimeSyncedTripPlacesSource(source: RuntimeTripPlacesSource) {
  runtimeSyncedPlacesSource = source;
}

export function clearRuntimeSyncedTripPlacesSource() {
  runtimeSyncedPlacesSource = undefined;
}

interface PersistedTripPlaceRow {
  source_place_id: string | null;
  source_index: number | null;
  name: string;
  type: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  note: string | null;
}

function persistedRowToSourcePlace(row: PersistedTripPlaceRow): SourcePlace {
  return {
    id: row.source_place_id ?? undefined,
    sourceIndex: row.source_index ?? undefined,
    name: row.name,
    type: row.type,
    address: row.address ?? undefined,
    lat: row.lat ?? undefined,
    lng: row.lng ?? undefined,
    note: row.note ?? undefined
  };
}

export function isCompletePersistedPlacesSnapshot(persistedCount: number, fixtureCount: number) {
  return persistedCount >= Math.max(20, Math.floor(fixtureCount * 0.5));
}

export function getStaleSourcePlaceIds(previousIds: string[], currentIds: string[]) {
  const current = new Set(currentIds);
  return previousIds.filter((id) => !current.has(id));
}

export async function hydrateRuntimeTripPlacesFromPersistentStorage() {
  if (getActiveDemoStorageDriverName() !== "supabase") return { status: "not_configured" as const, count: 0 };
  const supabase = await ensureDemoRelationalBase();
  if (!supabase) return { status: "not_configured" as const, count: 0 };

  const { data, error } = await supabase
    .from("trip_places")
    .select("source_place_id, source_index, name, type, address, lat, lng, note")
    .eq("trip_group_id", DEMO_TRIP_GROUP_UUID)
    .eq("source_id", DEMO_SOURCE_ID)
    .order("source_index", { ascending: true });
  if (error) throw new Error(`Supabase trip places load failed: ${error.message}`);

  const rows = (data ?? []) as PersistedTripPlaceRow[];
  const fixtureCount = (JSON.parse(readFileSync(resolvePlacesPath(), "utf8")) as SourcePlace[]).length;
  if (!isCompletePersistedPlacesSnapshot(rows.length, fixtureCount)) {
    return { status: "partial_ignored" as const, count: rows.length };
  }

  setRuntimeSyncedTripPlacesSource({
    label: "Persisted Google Maps trip points",
    sourceUrl: process.env.DEMO_GOOGLE_SOURCE_URL || DEMO_GOOGLE_SOURCE_URL,
    importedAt: new Date().toISOString(),
    places: rows.map(persistedRowToSourcePlace)
  });
  return { status: "ready" as const, count: rows.length };
}

export async function persistRuntimeTripPlacesSnapshot(source: RuntimeTripPlacesSource) {
  if (getActiveDemoStorageDriverName() !== "supabase") return { status: "not_configured" as const, count: 0 };
  const supabase = await ensureDemoRelationalBase();
  if (!supabase) return { status: "not_configured" as const, count: 0 };

  const { data: previousRows, error: previousRowsError } = await supabase
    .from("trip_places")
    .select("source_place_id")
    .eq("trip_group_id", DEMO_TRIP_GROUP_UUID)
    .eq("source_id", DEMO_SOURCE_ID);
  if (previousRowsError) throw new Error(`Supabase current trip places read failed: ${previousRowsError.message}`);

  const normalized = source.places.map((place, index) => {
    const sourcePlaceId = place.id ?? place.googleIds?.join(":") ?? `place_${index}`;
    const type = normalizePlaceType(place.type);
    return {
      id: getDemoTripPlaceUuid(sourcePlaceId),
      trip_group_id: DEMO_TRIP_GROUP_UUID,
      source_id: DEMO_SOURCE_ID,
      source_place_id: sourcePlaceId,
      source_index: place.sourceIndex ?? index,
      name: place.name ?? "Unnamed place",
      type,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      note: place.note,
      tags: normalizeTags(place, type),
      visit_state: "unvisited",
      updated_at: source.importedAt
    };
  });
  const { error } = await supabase.from("trip_places").upsert(normalized, { onConflict: "id" });
  if (error) throw new Error(`Supabase trip places snapshot save failed: ${error.message}`);

  const currentSourcePlaceIds = normalized.map((place) => place.source_place_id);
  const previousSourcePlaceIds = (previousRows ?? [])
    .map((row) => row.source_place_id)
    .filter((id): id is string => typeof id === "string");
  const staleSourcePlaceIds = getStaleSourcePlaceIds(previousSourcePlaceIds, currentSourcePlaceIds);
  if (staleSourcePlaceIds.length > 0) {
    const archivedSourceId = `${DEMO_SOURCE_ID}:archived:${source.importedAt}`;
    const { error: archiveError } = await supabase
      .from("trip_places")
      .update({ source_id: archivedSourceId, updated_at: source.importedAt })
      .eq("trip_group_id", DEMO_TRIP_GROUP_UUID)
      .eq("source_id", DEMO_SOURCE_ID)
      .in("source_place_id", staleSourcePlaceIds);
    if (archiveError) throw new Error(`Supabase stale trip places archive failed: ${archiveError.message}`);
  }

  return { status: "ready" as const, count: normalized.length, archivedCount: staleSourcePlaceIds.length };
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
  const sourcePlaces =
    runtimeSyncedPlacesSource?.places ?? (JSON.parse(readFileSync(resolvePlacesPath(), "utf8")) as SourcePlace[]);

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
