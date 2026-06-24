import type { StoredGroupDestination } from "./demoStorage.js";
import {
  getActiveDemoStorageDriverName,
  loadDemoStorage,
  loadDemoStorageAsync,
  saveDemoStorage,
  saveDemoStorageAsync
} from "./demoStorage.js";
import { demoMemberUuidById, demoRelationalMembers, DEMO_GROUP_ID, DEMO_TRIP_GROUP_UUID } from "./demoRelationalIds.js";
import { ensureDemoTripPlace } from "./demoRelationalPlaces.js";
import { ensureDemoRelationalBase } from "./demoRelationalSeed.js";
import { loadDemoTripPlaces } from "./localPlaces.js";

export function loadDemoGroupDestination() {
  return loadDemoStorage().groupDestination ?? null;
}

export async function loadDemoGroupDestinationAsync() {
  const supabaseDestination = await loadSupabaseGroupDestination();
  if (supabaseDestination !== undefined) {
    return supabaseDestination;
  }

  return (await loadDemoStorageAsync()).groupDestination ?? null;
}

export function saveDemoGroupDestination(destination: StoredGroupDestination) {
  saveDemoStorage({
    groupDestination: destination
  });
  return destination;
}

export async function saveDemoGroupDestinationAsync(destination: StoredGroupDestination) {
  const supabaseDestination = await saveSupabaseGroupDestination(destination);
  if (supabaseDestination) {
    return supabaseDestination;
  }

  await saveDemoStorageAsync({
    groupDestination: destination
  });
  return destination;
}

export function resetDemoGroupDestination() {
  saveDemoStorage({
    groupDestination: null
  });
  return null;
}

export async function resetDemoGroupDestinationAsync() {
  if (await resetSupabaseGroupDestination()) {
    return null;
  }

  await saveDemoStorageAsync({
    groupDestination: null
  });
  return null;
}

interface SupabaseGroupDestinationRow {
  trip_group_id: string;
  place_id: string;
  set_by_member_id: string;
  set_at: string;
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

async function loadSupabaseGroupDestination(): Promise<StoredGroupDestination | null | undefined> {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return undefined;
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return undefined;
  }

  const { data: destination, error } = await supabase
    .from("group_destinations")
    .select("trip_group_id, place_id, set_by_member_id, set_at")
    .eq("trip_group_id", DEMO_TRIP_GROUP_UUID)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase group destination load failed: ${error.message}`);
  }

  if (!destination) {
    return null;
  }

  const { data: place, error: placeError } = await supabase
    .from("trip_places")
    .select("id, source_place_id, name, address, lat, lng")
    .eq("id", (destination as SupabaseGroupDestinationRow).place_id)
    .single();

  if (placeError) {
    throw new Error(`Supabase group destination place load failed: ${placeError.message}`);
  }

  const destinationRow = destination as SupabaseGroupDestinationRow;
  const placeRow = place as SupabaseTripPlaceRow;
  const setByMemberId = getDemoMemberIdByUuid(destinationRow.set_by_member_id) ?? "mom";

  return {
    tripGroupId: DEMO_GROUP_ID,
    placeId: placeRow.source_place_id ?? placeRow.id,
    placeName: placeRow.name,
    address: placeRow.address ?? undefined,
    lat: placeRow.lat ?? undefined,
    lng: placeRow.lng ?? undefined,
    setByMemberId,
    setByName: getDemoMemberName(setByMemberId),
    setAt: destinationRow.set_at
  };
}

async function saveSupabaseGroupDestination(destination: StoredGroupDestination): Promise<StoredGroupDestination | null> {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return null;
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return null;
  }

  const place = loadDemoTripPlaces().find((item) => item.id === destination.placeId);
  if (!place) {
    throw new Error("Supabase group destination save failed: place_not_found");
  }

  const placeUuid = await ensureDemoTripPlace(supabase, place);
  const setByMemberUuid = demoMemberUuidById[destination.setByMemberId] ?? demoMemberUuidById.mom;
  const { error } = await supabase.from("group_destinations").upsert({
    trip_group_id: DEMO_TRIP_GROUP_UUID,
    place_id: placeUuid,
    set_by_member_id: setByMemberUuid,
    set_at: destination.setAt
  });

  if (error) {
    throw new Error(`Supabase group destination save failed: ${error.message}`);
  }

  return {
    ...destination,
    placeName: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    setByName: getDemoMemberName(destination.setByMemberId)
  };
}

async function resetSupabaseGroupDestination() {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return false;
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return false;
  }

  const { error } = await supabase.from("group_destinations").delete().eq("trip_group_id", DEMO_TRIP_GROUP_UUID);
  if (error) {
    throw new Error(`Supabase group destination reset failed: ${error.message}`);
  }

  return true;
}
