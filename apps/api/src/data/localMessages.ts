import {
  getActiveDemoStorageDriverName,
  loadDemoStorage,
  loadDemoStorageAsync,
  saveDemoStorage,
  saveDemoStorageAsync,
  type StoredDemoMessage
} from "./demoStorage.js";
import { DEMO_GROUP_ID, DEMO_TRIP_GROUP_UUID, demoMemberUuidById } from "./demoRelationalIds.js";
import { ensureDemoRelationalBase } from "./demoRelationalSeed.js";

const initialDemoMessages: StoredDemoMessage[] = [
  {
    id: "msg_kodi_start_hint",
    tripGroupId: DEMO_GROUP_ID,
    author: "קודי",
    text: "הי, אני כאן בשיחה הקבוצתית ועונה להודעות הקבוצה.",
    source: "agent",
    createdAt: "2026-07-08T00:00:00.000Z"
  }
];

const retiredSeedMessageIds = new Set([
  "msg_demo_dad_ice_cream",
  "msg_demo_noa_sleep",
  "msg_demo_mom_kodi",
  "msg_demo_kodi_reply"
]);

const retiredSeedMessageTextFragments = [
  "בא לי גלידה.",
  "בא לי לישון.",
  "אפשר לאכול שם גלידה",
  "אבא רוצה גלידה",
  "נועה עייפה",
  "בדיקת שמירת שיחה",
  "הודעה שנכנסה מבחוץ",
  "בדיקת פעילות מיידית",
  "Averof 12",
  "יעד הקבוצתי הנוכחי",
  "מסלול קבוצתי קצר סביב",
  "התחנה הפעילה הבאה במסלול"
];

function isRetiredSeedMessage(message: StoredDemoMessage) {
  return (
    message.author === "QA" ||
    retiredSeedMessageTextFragments.some((fragment) => message.author.includes(fragment)) ||
    ["אבא", "אמא", "נועה", "סבתא"].includes(message.author) ||
    /^\?[\s?]*$/.test(message.text.trim()) ||
    retiredSeedMessageIds.has(message.id) ||
    retiredSeedMessageTextFragments.some((fragment) => message.text.includes(fragment))
  );
}

function createMessageId(source: StoredDemoMessage["source"]) {
  return `msg_${source}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function cleanAgentMessageText(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|\s)\*{1,3}(?=\S)/g, "$1")
    .replace(/(\S)\*{1,3}(?=\s|$|[.,!?;:)\]])/g, "$1")
    .replace(/\*+\s*$/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function normalizeMessageText(message: StoredDemoMessage): StoredDemoMessage {
  if (message.source !== "agent") {
    return message;
  }

  return {
    ...message,
    text: cleanAgentMessageText(message.text)
  };
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
  return ensureDemoRelationalBase();
}

function mapSupabaseMessage(row: SupabaseGroupMessageRow): StoredDemoMessage {
  const memberId = Object.entries(demoMemberUuidById).find(([, uuid]) => uuid === row.member_id)?.[0];

  return {
    id: row.id,
    tripGroupId: DEMO_GROUP_ID,
    author: row.author,
    text: row.source === "agent" ? cleanAgentMessageText(row.text) : row.text,
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
    .order("created_at", { ascending: false })
    .limit(80);

  if (error) {
    throw new Error(`Supabase messages load failed: ${error.message}`);
  }

  if (!data || data.length === 0) {
    return initialDemoMessages;
  }

  return data
    .map((row) => mapSupabaseMessage(row as SupabaseGroupMessageRow))
    .filter((message) => !isRetiredSeedMessage(message))
    .reverse();
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
      text: input.source === "agent" ? cleanAgentMessageText(input.text) : input.text,
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
  return (loadDemoStorage().messages ?? initialDemoMessages)
    .filter((message) => !isRetiredSeedMessage(message))
    .map(normalizeMessageText);
}

export function loadDemoTripMessages(): StoredDemoMessage[] {
  return structuredClone(getStoredOrInitialMessages());
}

async function getStoredOrInitialMessagesAsync() {
  const supabaseMessages = await loadSupabaseMessages();
  if (supabaseMessages) {
    return supabaseMessages;
  }

  return ((await loadDemoStorageAsync()).messages ?? initialDemoMessages)
    .filter((message) => !isRetiredSeedMessage(message))
    .map(normalizeMessageText);
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
    text: source === "agent" ? cleanAgentMessageText(input.text) : input.text,
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
    text: source === "agent" ? cleanAgentMessageText(input.text) : input.text,
    memberId: input.memberId,
    source,
    createdAt: new Date().toISOString()
  };

  const nextMessages = [...currentMessages, nextMessage].slice(-80);
  await saveDemoStorageAsync({ messages: nextMessages });
  return structuredClone(nextMessage);
}
