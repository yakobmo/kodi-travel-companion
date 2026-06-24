import {
  getActiveDemoStorageDriverName,
  loadDemoStorage,
  loadDemoStorageAsync,
  saveDemoStorage,
  saveDemoStorageAsync,
  type StoredDemoMessage
} from "./demoStorage.js";
import { DEMO_GROUP_ID, DEMO_TRIP_GROUP_UUID, demoMemberUuidById } from "./demoRelationalIds.js";
import { createSupabaseServerClient } from "./supabaseClient.js";

const INITIAL_CREATED_AT = "2026-06-23T09:00:00.000Z";

const initialDemoMessages: StoredDemoMessage[] = [
  {
    id: "msg_demo_dad_ice_cream",
    tripGroupId: DEMO_GROUP_ID,
    author: "אבא",
    text: "בא לי גלידה.",
    memberId: "dad",
    source: "member",
    createdAt: INITIAL_CREATED_AT
  },
  {
    id: "msg_demo_noa_sleep",
    tripGroupId: DEMO_GROUP_ID,
    author: "נועה",
    text: "בא לי לישון.",
    memberId: "noa",
    source: "member",
    createdAt: INITIAL_CREATED_AT
  },
  {
    id: "msg_demo_mom_kodi",
    tripGroupId: DEMO_GROUP_ID,
    author: "אמא",
    text: "קודי, יש לך המלצה למשהו שיהיה קרוב למלון ואפשר לאכול שם גלידה?",
    memberId: "mom",
    source: "member",
    createdAt: INITIAL_CREATED_AT
  },
  {
    id: "msg_demo_kodi_reply",
    tripGroupId: DEMO_GROUP_ID,
    author: "קודי",
    text:
      "שמעתי: אבא רוצה גלידה, נועה עייפה, ואמא מחפשת משהו קרוב למלון. הייתי מחפש מקום קל ליד Hotel Marathia, בלי סטייה גדולה ובלי הליכה ארוכה. אם תרצו, אסמן הצעה ואפתח ניווט.",
    source: "agent",
    createdAt: INITIAL_CREATED_AT
  }
];

function createMessageId(source: StoredDemoMessage["source"]) {
  return `msg_${source}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

interface SupabaseGroupMessageRow {
  id: string;
  trip_group_id: string;
  member_id: string | null;
  author: string;
  text: string;
  source: StoredDemoMessage["source"];
  created_at: string;
}

async function ensureDemoTripGroupForMessages() {
  const supabase = createSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const { error } = await supabase.from("trip_groups").upsert({
    id: DEMO_TRIP_GROUP_UUID,
    name: "צפון יוון",
    google_source_url: "https://maps.app.goo.gl/MspoN6j9CJDyGmtb8",
    google_source_state: "demo_link_ready",
    updated_at: new Date().toISOString()
  });

  if (error) {
    throw new Error(`Supabase demo trip group seed failed: ${error.message}`);
  }

  const { error: membersError } = await supabase.from("trip_members").upsert([
    {
      id: demoMemberUuidById.dad,
      trip_group_id: DEMO_TRIP_GROUP_UUID,
      display_name: "אבא",
      role: "admin",
      can_chat_with_agent: true,
      can_mark_visited: true,
      can_manage_places: true,
      can_manage_members: false,
      updated_at: new Date().toISOString()
    },
    {
      id: demoMemberUuidById.mom,
      trip_group_id: DEMO_TRIP_GROUP_UUID,
      display_name: "אמא",
      role: "owner",
      can_chat_with_agent: true,
      can_mark_visited: true,
      can_manage_places: true,
      can_manage_members: true,
      updated_at: new Date().toISOString()
    },
    {
      id: demoMemberUuidById.noa,
      trip_group_id: DEMO_TRIP_GROUP_UUID,
      display_name: "נועה",
      role: "member",
      can_chat_with_agent: true,
      can_mark_visited: false,
      can_manage_places: false,
      can_manage_members: false,
      updated_at: new Date().toISOString()
    },
    {
      id: demoMemberUuidById.grandma,
      trip_group_id: DEMO_TRIP_GROUP_UUID,
      display_name: "סבתא",
      role: "viewer",
      can_chat_with_agent: true,
      can_mark_visited: false,
      can_manage_places: false,
      can_manage_members: false,
      updated_at: new Date().toISOString()
    }
  ]);

  if (membersError) {
    throw new Error(`Supabase demo members seed failed: ${membersError.message}`);
  }

  return supabase;
}

function mapSupabaseMessage(row: SupabaseGroupMessageRow): StoredDemoMessage {
  const memberId = Object.entries(demoMemberUuidById).find(([, uuid]) => uuid === row.member_id)?.[0];

  return {
    id: row.id,
    tripGroupId: DEMO_GROUP_ID,
    author: row.author,
    text: row.text,
    memberId,
    source: row.source,
    createdAt: row.created_at
  };
}

async function loadSupabaseMessages(): Promise<StoredDemoMessage[] | null> {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return null;
  }

  const supabase = await ensureDemoTripGroupForMessages();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("group_messages")
    .select("id, trip_group_id, member_id, author, text, source, created_at")
    .eq("trip_group_id", DEMO_TRIP_GROUP_UUID)
    .order("created_at", { ascending: true })
    .limit(80);

  if (error) {
    throw new Error(`Supabase messages load failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    const { error: seedError } = await supabase.from("group_messages").insert(
      initialDemoMessages.map((message) => ({
        trip_group_id: DEMO_TRIP_GROUP_UUID,
        member_id: message.memberId ? (demoMemberUuidById[message.memberId] ?? null) : null,
        author: message.author,
        text: message.text,
        source: message.source,
        created_at: message.createdAt
      }))
    );

    if (seedError) {
      throw new Error(`Supabase initial messages seed failed: ${seedError.message}`);
    }

    return initialDemoMessages;
  }

  return data.map((row) => mapSupabaseMessage(row as SupabaseGroupMessageRow));
}

async function insertSupabaseMessage(input: {
  author: string;
  text: string;
  memberId?: string;
  source: StoredDemoMessage["source"];
}): Promise<StoredDemoMessage | null> {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return null;
  }

  const supabase = await ensureDemoTripGroupForMessages();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from("group_messages")
    .insert({
      trip_group_id: DEMO_TRIP_GROUP_UUID,
      member_id: input.memberId ? (demoMemberUuidById[input.memberId] ?? null) : null,
      author: input.author,
      text: input.text,
      source: input.source
    })
    .select("id, trip_group_id, member_id, author, text, source, created_at")
    .single();

  if (error) {
    throw new Error(`Supabase messages insert failed: ${error.message}`);
  }

  return mapSupabaseMessage(data as SupabaseGroupMessageRow);
}

async function resetSupabaseMessages() {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return false;
  }

  const supabase = await ensureDemoTripGroupForMessages();
  if (!supabase) {
    return false;
  }

  const { error } = await supabase.from("group_messages").delete().eq("trip_group_id", DEMO_TRIP_GROUP_UUID);
  if (error) {
    throw new Error(`Supabase messages reset failed: ${error.message}`);
  }

  return true;
}

function getStoredOrInitialMessages() {
  return loadDemoStorage().messages ?? initialDemoMessages;
}

export function loadDemoTripMessages(): StoredDemoMessage[] {
  return structuredClone(getStoredOrInitialMessages());
}

async function getStoredOrInitialMessagesAsync() {
  const supabaseMessages = await loadSupabaseMessages();
  if (supabaseMessages) {
    return supabaseMessages;
  }

  return (await loadDemoStorageAsync()).messages ?? initialDemoMessages;
}

export async function loadDemoTripMessagesAsync(): Promise<StoredDemoMessage[]> {
  return structuredClone(await getStoredOrInitialMessagesAsync());
}

export function resetDemoTripMessages() {
  saveDemoStorage({ messages: null });
  return loadDemoTripMessages();
}

export async function resetDemoTripMessagesAsync() {
  if (await resetSupabaseMessages()) {
    return loadDemoTripMessagesAsync();
  }

  await saveDemoStorageAsync({ messages: null });
  return loadDemoTripMessagesAsync();
}

export function appendDemoTripMessage(input: {
  author: string;
  text: string;
  memberId?: string;
  source?: StoredDemoMessage["source"];
}) {
  const currentMessages = loadDemoTripMessages();
  const source = input.source ?? "member";
  const nextMessage: StoredDemoMessage = {
    id: createMessageId(source),
    tripGroupId: DEMO_GROUP_ID,
    author: input.author,
    text: input.text,
    memberId: input.memberId,
    source,
    createdAt: new Date().toISOString()
  };

  const nextMessages = [...currentMessages, nextMessage].slice(-80);
  saveDemoStorage({ messages: nextMessages });
  return structuredClone(nextMessage);
}

export async function appendDemoTripMessageAsync(input: {
  author: string;
  text: string;
  memberId?: string;
  source?: StoredDemoMessage["source"];
}) {
  const source = input.source ?? "member";
  const supabaseMessage = await insertSupabaseMessage({
    author: input.author,
    text: input.text,
    memberId: input.memberId,
    source
  });

  if (supabaseMessage) {
    return structuredClone(supabaseMessage);
  }

  const currentMessages = await loadDemoTripMessagesAsync();
  const nextMessage: StoredDemoMessage = {
    id: createMessageId(source),
    tripGroupId: DEMO_GROUP_ID,
    author: input.author,
    text: input.text,
    memberId: input.memberId,
    source,
    createdAt: new Date().toISOString()
  };

  const nextMessages = [...currentMessages, nextMessage].slice(-80);
  await saveDemoStorageAsync({ messages: nextMessages });
  return structuredClone(nextMessage);
}
