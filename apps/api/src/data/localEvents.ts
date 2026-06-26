import type { SupabaseClient } from "@supabase/supabase-js";
import type { TripEvent, TripEventType } from "../domain/types.js";
import {
  getActiveDemoStorageDriverName,
  loadDemoStorage,
  loadDemoStorageAsync,
  saveDemoStorage,
  saveDemoStorageAsync
} from "./demoStorage.js";
import { DEMO_GROUP_ID, DEMO_TRIP_GROUP_UUID, demoMemberUuidById } from "./demoRelationalIds.js";
import { ensureDemoRelationalBase } from "./demoRelationalSeed.js";

const INITIAL_CREATED_AT = "2026-06-23T09:00:00.000Z";

const initialDemoEvents: TripEvent[] = [
  {
    id: "evt_demo_system_ready",
    tripGroupId: DEMO_GROUP_ID,
    eventType: "system",
    actorName: "Kodi",
    summary: "Demo trip event stream initialized.",
    createdAt: INITIAL_CREATED_AT
  }
];

interface SupabaseEventRow {
  id: string;
  trip_group_id: string;
  event_type: TripEventType;
  actor_member_id: string | null;
  actor_name: string | null;
  related_entity_id: string | null;
  summary: string;
  created_at: string;
}

export interface TripEventLogStatus {
  driver: "file" | "supabase";
  eventLogReady: boolean;
  checkedAt: string;
  error?: string;
}

function createEventId(eventType: TripEventType) {
  return `evt_${eventType}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function isMissingEventTableError(error: { message?: string; code?: string } | null) {
  if (!error) {
    return false;
  }

  return (
    error.code === "42P01" ||
    error.message?.includes("group_events") ||
    error.message?.includes("Could not find the table")
  );
}

function getDemoMemberIdByUuid(uuid: string | null) {
  if (!uuid) {
    return undefined;
  }

  return Object.entries(demoMemberUuidById).find(([, memberUuid]) => memberUuid === uuid)?.[0];
}

function getMemberUuid(memberId: string | undefined) {
  return memberId ? (demoMemberUuidById[memberId] ?? null) : null;
}

function mapSupabaseEvent(row: SupabaseEventRow): TripEvent {
  return {
    id: row.id,
    tripGroupId: DEMO_GROUP_ID,
    eventType: row.event_type,
    actorMemberId: getDemoMemberIdByUuid(row.actor_member_id),
    actorName: row.actor_name ?? undefined,
    relatedEntityId: row.related_entity_id ?? undefined,
    summary: row.summary,
    createdAt: row.created_at
  };
}

async function getSupabaseForEvents(): Promise<SupabaseClient | null> {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return null;
  }

  return ensureDemoRelationalBase();
}

async function loadSupabaseEvents(): Promise<TripEvent[] | null> {
  const supabase = await getSupabaseForEvents();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("group_events")
    .select("id, trip_group_id, event_type, actor_member_id, actor_name, related_entity_id, summary, created_at")
    .eq("trip_group_id", DEMO_TRIP_GROUP_UUID)
    .order("created_at", { ascending: false })
    .limit(80);

  if (isMissingEventTableError(error)) {
    return null;
  }

  if (error) {
    throw new Error(`Supabase event log load failed: ${error.message}`);
  }

  return (data as SupabaseEventRow[]).map(mapSupabaseEvent);
}

async function insertSupabaseEvent(input: Omit<TripEvent, "id" | "tripGroupId" | "createdAt">): Promise<TripEvent | null> {
  const supabase = await getSupabaseForEvents();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("group_events")
    .insert({
      trip_group_id: DEMO_TRIP_GROUP_UUID,
      event_type: input.eventType,
      actor_member_id: getMemberUuid(input.actorMemberId),
      actor_name: input.actorName,
      related_entity_id: input.relatedEntityId,
      summary: input.summary
    })
    .select("id, trip_group_id, event_type, actor_member_id, actor_name, related_entity_id, summary, created_at")
    .single();

  if (isMissingEventTableError(error)) {
    return null;
  }

  if (error) {
    throw new Error(`Supabase event log insert failed: ${error.message}`);
  }

  return mapSupabaseEvent(data as SupabaseEventRow);
}

async function resetSupabaseEvents() {
  const supabase = await getSupabaseForEvents();
  if (!supabase) {
    return false;
  }

  const { error } = await supabase.from("group_events").delete().eq("trip_group_id", DEMO_TRIP_GROUP_UUID);
  if (isMissingEventTableError(error)) {
    return false;
  }

  if (error) {
    throw new Error(`Supabase event log reset failed: ${error.message}`);
  }

  return true;
}

export async function getDemoTripEventLogStatus(): Promise<TripEventLogStatus> {
  const checkedAt = new Date().toISOString();
  const driver = getActiveDemoStorageDriverName();

  if (driver !== "supabase") {
    return {
      driver,
      eventLogReady: false,
      checkedAt
    };
  }

  const supabase = await getSupabaseForEvents();
  if (!supabase) {
    return {
      driver,
      eventLogReady: false,
      checkedAt,
      error: "missing_supabase_server_client"
    };
  }

  const { error } = await supabase.from("group_events").select("id", { count: "exact", head: true }).limit(1);

  return {
    driver,
    eventLogReady: !error,
    checkedAt,
    error: error ? error.message : undefined
  };
}

export function loadDemoTripEvents(): TripEvent[] {
  return structuredClone(loadDemoStorage().events ?? initialDemoEvents);
}

export async function loadDemoTripEventsAsync(): Promise<TripEvent[]> {
  const supabaseEvents = await loadSupabaseEvents();
  if (supabaseEvents) {
    return structuredClone(supabaseEvents);
  }

  return structuredClone((await loadDemoStorageAsync()).events ?? initialDemoEvents);
}

export function recordDemoTripEvent(input: {
  eventType: TripEventType;
  actorMemberId?: string;
  actorName?: string;
  relatedEntityId?: string;
  summary: string;
}) {
  const nextEvent: TripEvent = {
    id: createEventId(input.eventType),
    tripGroupId: DEMO_GROUP_ID,
    eventType: input.eventType,
    actorMemberId: input.actorMemberId,
    actorName: input.actorName,
    relatedEntityId: input.relatedEntityId,
    summary: input.summary,
    createdAt: new Date().toISOString()
  };
  const nextEvents = [nextEvent, ...loadDemoTripEvents()].slice(0, 80);
  saveDemoStorage({ events: nextEvents });
  return structuredClone(nextEvent);
}

export async function recordDemoTripEventAsync(input: {
  eventType: TripEventType;
  actorMemberId?: string;
  actorName?: string;
  relatedEntityId?: string;
  summary: string;
}) {
  const supabaseEvent = await insertSupabaseEvent(input);
  if (supabaseEvent) {
    return structuredClone(supabaseEvent);
  }

  const nextEvent: TripEvent = {
    id: createEventId(input.eventType),
    tripGroupId: DEMO_GROUP_ID,
    eventType: input.eventType,
    actorMemberId: input.actorMemberId,
    actorName: input.actorName,
    relatedEntityId: input.relatedEntityId,
    summary: input.summary,
    createdAt: new Date().toISOString()
  };
  const nextEvents = [nextEvent, ...(await loadDemoTripEventsAsync())].slice(0, 80);
  await saveDemoStorageAsync({ events: nextEvents });
  return structuredClone(nextEvent);
}

export async function resetDemoTripEventsAsync() {
  if (await resetSupabaseEvents()) {
    return loadDemoTripEventsAsync();
  }

  await saveDemoStorageAsync({ events: null });
  return loadDemoTripEventsAsync();
}
