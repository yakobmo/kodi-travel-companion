import type { TripMemberLocationView } from "../domain/types.js";
import { loadDemoStorage, saveDemoStorage } from "./demoStorage.js";

const DEMO_GROUP_ID = "group_family_greece_demo";
const UPDATED_AT = "2026-06-23T09:00:00.000Z";

const initialDemoMembers: TripMemberLocationView[] = [
  {
    member: {
      id: "dad",
      tripGroupId: DEMO_GROUP_ID,
      displayName: "אבא",
      ageGroup: "adult",
      role: "admin",
      canChatWithAgent: true,
      canMarkVisited: true,
      canManagePlaces: true,
      canManageMembers: false
    },
    consent: {
      memberId: "dad",
      tripGroupId: DEMO_GROUP_ID,
      state: "enabled",
      updatedAt: UPDATED_AT
    },
    liveLocation: {
      memberId: "dad",
      tripGroupId: DEMO_GROUP_ID,
      lat: 39.2518,
      lng: 22.752,
      accuracyMeters: 18,
      updatedAt: UPDATED_AT,
      source: "demo"
    },
    displayLabel: "ליד המלון",
    updatedMinutesAgo: 2
  },
  {
    member: {
      id: "mom",
      tripGroupId: DEMO_GROUP_ID,
      displayName: "אמא",
      ageGroup: "adult",
      role: "owner",
      canChatWithAgent: true,
      canMarkVisited: true,
      canManagePlaces: true,
      canManageMembers: true
    },
    consent: {
      memberId: "mom",
      tripGroupId: DEMO_GROUP_ID,
      state: "enabled",
      updatedAt: UPDATED_AT
    },
    liveLocation: {
      memberId: "mom",
      tripGroupId: DEMO_GROUP_ID,
      lat: 39.2512,
      lng: 22.7512,
      accuracyMeters: 12,
      updatedAt: UPDATED_AT,
      source: "demo"
    },
    displayLabel: "בקבלה",
    updatedMinutesAgo: 1
  },
  {
    member: {
      id: "noa",
      tripGroupId: DEMO_GROUP_ID,
      displayName: "נועה",
      ageGroup: "child",
      role: "member",
      canChatWithAgent: true,
      canMarkVisited: false,
      canManagePlaces: false,
      canManageMembers: false
    },
    consent: {
      memberId: "noa",
      tripGroupId: DEMO_GROUP_ID,
      state: "enabled",
      updatedAt: UPDATED_AT
    },
    liveLocation: {
      memberId: "noa",
      tripGroupId: DEMO_GROUP_ID,
      lat: 39.2508,
      lng: 22.7517,
      accuracyMeters: 20,
      updatedAt: UPDATED_AT,
      source: "demo"
    },
    displayLabel: "בחדר",
    updatedMinutesAgo: 4
  },
  {
    member: {
      id: "grandma",
      tripGroupId: DEMO_GROUP_ID,
      displayName: "סבתא",
      ageGroup: "senior",
      role: "viewer",
      canChatWithAgent: true,
      canMarkVisited: false,
      canManagePlaces: false,
      canManageMembers: false
    },
    consent: {
      memberId: "grandma",
      tripGroupId: DEMO_GROUP_ID,
      state: "disabled",
      updatedAt: UPDATED_AT
    },
    liveLocation: null,
    displayLabel: "מיקום לא משותף"
  }
];

function getStoredOrInitialMembers() {
  return loadDemoStorage().members ?? initialDemoMembers;
}

export function loadDemoTripMembers(): TripMemberLocationView[] {
  return structuredClone(getStoredOrInitialMembers());
}

export function resetDemoTripMembers() {
  saveDemoStorage({ members: null });
  return loadDemoTripMembers();
}

export function updateDemoMemberLocation(input: {
  memberId: string;
  lat: number;
  lng: number;
  accuracyMeters?: number;
}) {
  const demoMembers = loadDemoTripMembers();
  const memberIndex = demoMembers.findIndex((item) => item.member.id === input.memberId);

  if (memberIndex < 0) {
    return { ok: false as const, error: "member_not_found" };
  }

  const member = demoMembers[memberIndex];
  if (member.consent.state !== "enabled") {
    return { ok: false as const, error: "location_sharing_not_enabled" };
  }

  const updatedAt = new Date().toISOString();
  demoMembers[memberIndex] = {
    ...member,
    liveLocation: {
      memberId: member.member.id,
      tripGroupId: member.member.tripGroupId,
      lat: input.lat,
      lng: input.lng,
      accuracyMeters: input.accuracyMeters,
      updatedAt,
      source: "gps"
    },
    displayLabel: "GPS אישי",
    updatedMinutesAgo: 0
  };

  saveDemoStorage({ members: demoMembers });
  return { ok: true as const, member: structuredClone(demoMembers[memberIndex]) };
}
