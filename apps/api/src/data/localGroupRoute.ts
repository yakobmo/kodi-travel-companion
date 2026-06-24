import type { StoredGroupRoute } from "./demoStorage.js";
import {
  getActiveDemoStorageDriverName,
  loadDemoStorage,
  loadDemoStorageAsync,
  saveDemoStorage,
  saveDemoStorageAsync
} from "./demoStorage.js";
import { DEMO_GROUP_ID, DEMO_TRIP_GROUP_UUID, demoMemberUuidById, demoRelationalMembers } from "./demoRelationalIds.js";
import { ensureDemoTripPlace } from "./demoRelationalPlaces.js";
import { ensureDemoRelationalBase } from "./demoRelationalSeed.js";
import { loadDemoTripPlaces } from "./localPlaces.js";

export function loadDemoGroupRoute() {
  return loadDemoStorage().groupRoute ?? null;
}

export async function loadDemoGroupRouteAsync() {
  const supabaseRoute = await loadSupabaseGroupRoute();
  if (supabaseRoute !== undefined) {
    return supabaseRoute;
  }

  return (await loadDemoStorageAsync()).groupRoute ?? null;
}

export function saveDemoGroupRoute(route: StoredGroupRoute) {
  saveDemoStorage({
    groupRoute: route
  });
  return route;
}

export async function saveDemoGroupRouteAsync(route: StoredGroupRoute) {
  const supabaseRoute = await saveSupabaseGroupRoute(route);
  if (supabaseRoute) {
    return supabaseRoute;
  }

  await saveDemoStorageAsync({
    groupRoute: route
  });
  return route;
}

export function resetDemoGroupRoute() {
  saveDemoStorage({
    groupRoute: null
  });
  return null;
}

export async function resetDemoGroupRouteAsync() {
  if (await resetSupabaseGroupRoute()) {
    return null;
  }

  await saveDemoStorageAsync({
    groupRoute: null
  });
  return null;
}

interface SupabaseGroupRouteRow {
  id: string;
  title: string;
  status: StoredGroupRoute["status"];
  active_stop_index: number;
  created_by_member_id: string;
  created_at: string;
}

interface SupabaseGroupRouteStopRow {
  place_id: string;
  stop_order: number;
  completed_at: string | null;
}

interface SupabaseTripPlaceRow {
  id: string;
  source_place_id: string | null;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
}

function getDemoMemberIdByUuid(uuid: string) {
  return Object.entries(demoMemberUuidById).find(([, memberUuid]) => memberUuid === uuid)?.[0];
}

function getDemoMemberName(memberId: string | undefined) {
  return demoRelationalMembers.find((member) => member.id === memberId)?.displayName ?? "קודי";
}

async function loadSupabaseGroupRoute(): Promise<StoredGroupRoute | null | undefined> {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return undefined;
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return undefined;
  }

  const { data: route, error } = await supabase
    .from("group_routes")
    .select("id, title, status, active_stop_index, created_by_member_id, created_at")
    .eq("trip_group_id", DEMO_TRIP_GROUP_UUID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase group route load failed: ${error.message}`);
  }

  if (!route) {
    return null;
  }

  const routeRow = route as SupabaseGroupRouteRow;
  const { data: stopRows, error: stopsError } = await supabase
    .from("group_route_stops")
    .select("place_id, stop_order, completed_at")
    .eq("route_id", routeRow.id)
    .order("stop_order", { ascending: true });

  if (stopsError) {
    throw new Error(`Supabase group route stops load failed: ${stopsError.message}`);
  }

  const placeIds = (stopRows as SupabaseGroupRouteStopRow[]).map((stop) => stop.place_id);
  const { data: placeRows, error: placesError } = await supabase
    .from("trip_places")
    .select("id, source_place_id, name, address, lat, lng")
    .in("id", placeIds);

  if (placesError) {
    throw new Error(`Supabase group route places load failed: ${placesError.message}`);
  }

  const placeByUuid = new Map((placeRows as SupabaseTripPlaceRow[]).map((place) => [place.id, place]));
  const stops = (stopRows as SupabaseGroupRouteStopRow[]).map((stop) => {
    const place = placeByUuid.get(stop.place_id);
    return {
      placeId: place?.source_place_id ?? stop.place_id,
      placeName: place?.name ?? "Unknown stop",
      address: place?.address ?? undefined,
      lat: place?.lat ?? undefined,
      lng: place?.lng ?? undefined,
      order: stop.stop_order
    };
  });
  const createdByMemberId = getDemoMemberIdByUuid(routeRow.created_by_member_id) ?? "mom";

  return {
    tripGroupId: DEMO_GROUP_ID,
    routeId: routeRow.id,
    title: routeRow.title,
    stops,
    activeStopIndex: routeRow.active_stop_index,
    completedStopIds: (stopRows as SupabaseGroupRouteStopRow[])
      .filter((stop) => stop.completed_at)
      .map((stop) => placeByUuid.get(stop.place_id)?.source_place_id ?? stop.place_id),
    createdByMemberId,
    createdByName: getDemoMemberName(createdByMemberId),
    createdAt: routeRow.created_at,
    status: routeRow.status
  };
}

async function saveSupabaseGroupRoute(route: StoredGroupRoute): Promise<StoredGroupRoute | null> {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return null;
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return null;
  }

  const places = loadDemoTripPlaces();
  const placeUuidBySourceId = new Map<string, string>();
  for (const stop of route.stops) {
    const place = places.find((item) => item.id === stop.placeId);
    if (!place) {
      throw new Error(`Supabase group route save failed: place_not_found:${stop.placeId}`);
    }
    placeUuidBySourceId.set(stop.placeId, await ensureDemoTripPlace(supabase, place));
  }

  await resetSupabaseGroupRoute();
  const createdByMemberUuid = demoMemberUuidById[route.createdByMemberId] ?? demoMemberUuidById.mom;
  const { data: savedRoute, error: routeError } = await supabase
    .from("group_routes")
    .insert({
      trip_group_id: DEMO_TRIP_GROUP_UUID,
      title: route.title,
      status: route.status,
      active_stop_index: route.activeStopIndex,
      created_by_member_id: createdByMemberUuid,
      created_at: route.createdAt,
      updated_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (routeError) {
    throw new Error(`Supabase group route save failed: ${routeError.message}`);
  }

  const routeUuid = (savedRoute as { id: string }).id;
  const { error: stopsError } = await supabase.from("group_route_stops").insert(
    route.stops.map((stop) => ({
      route_id: routeUuid,
      place_id: placeUuidBySourceId.get(stop.placeId),
      stop_order: stop.order,
      completed_at: route.completedStopIds.includes(stop.placeId) ? new Date().toISOString() : null
    }))
  );

  if (stopsError) {
    throw new Error(`Supabase group route stops save failed: ${stopsError.message}`);
  }

  return (await loadSupabaseGroupRoute()) ?? { ...route, routeId: routeUuid };
}

async function resetSupabaseGroupRoute() {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return false;
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return false;
  }

  const { error } = await supabase.from("group_routes").delete().eq("trip_group_id", DEMO_TRIP_GROUP_UUID);
  if (error) {
    throw new Error(`Supabase group route reset failed: ${error.message}`);
  }

  return true;
}
