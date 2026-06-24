import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripPlace } from "../domain/types.js";
import { DEMO_TRIP_GROUP_UUID } from "./demoRelationalIds.js";

function stableUuidFromText(value: string) {
  const hash = createHash("sha1").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function getDemoTripPlaceUuid(placeId: string) {
  return stableUuidFromText(`kodi-demo-place:${placeId}`);
}

export async function ensureDemoTripPlace(supabase: SupabaseClient, place: TripPlace) {
  const placeUuid = getDemoTripPlaceUuid(place.id);
  const { error } = await supabase.from("trip_places").upsert({
    id: placeUuid,
    trip_group_id: DEMO_TRIP_GROUP_UUID,
    source_id: place.sourceId,
    source_place_id: place.id,
    source_index: place.sourceIndex,
    name: place.name,
    type: place.type,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    note: place.note,
    tags: place.tags,
    visit_state: place.visitState,
    updated_at: new Date().toISOString()
  });

  if (error) {
    throw new Error(`Supabase demo place seed failed: ${error.message}`);
  }

  return placeUuid;
}

