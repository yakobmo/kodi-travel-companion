import {
  loadDemoStorage,
  loadDemoStorageAsync,
  saveDemoStorage,
  saveDemoStorageAsync,
  type StoredDemoMessage
} from "./demoStorage.js";

const DEMO_GROUP_ID = "group_family_greece_demo";
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

function getStoredOrInitialMessages() {
  return loadDemoStorage().messages ?? initialDemoMessages;
}

export function loadDemoTripMessages(): StoredDemoMessage[] {
  return structuredClone(getStoredOrInitialMessages());
}

async function getStoredOrInitialMessagesAsync() {
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
  const currentMessages = await loadDemoTripMessagesAsync();
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
  await saveDemoStorageAsync({ messages: nextMessages });
  return structuredClone(nextMessage);
}
