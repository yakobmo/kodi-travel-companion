export const DEMO_GROUP_ID = "group_family_greece_demo";
export const DEMO_TRIP_GROUP_UUID = "11111111-1111-4111-8111-111111111111";

export const demoMemberUuidById: Record<string, string> = {
  dad: "22222222-2222-4222-8222-222222222201",
  mom: "22222222-2222-4222-8222-222222222202",
  noa: "22222222-2222-4222-8222-222222222203",
  grandma: "22222222-2222-4222-8222-222222222204"
};

export const demoRelationalMembers = [
  {
    id: "dad",
    uuid: demoMemberUuidById.dad,
    displayName: "אבא",
    ageGroup: "adult",
    role: "admin",
    canChatWithAgent: true,
    canMarkVisited: true,
    canManagePlaces: true,
    canManageMembers: false,
    consentState: "enabled",
    displayLabel: "ליד המלון",
    liveLocation: {
      lat: 39.2518,
      lng: 22.752,
      accuracyMeters: 18,
      source: "demo"
    },
    updatedMinutesAgo: 2
  },
  {
    id: "mom",
    uuid: demoMemberUuidById.mom,
    displayName: "אמא",
    ageGroup: "adult",
    role: "owner",
    canChatWithAgent: true,
    canMarkVisited: true,
    canManagePlaces: true,
    canManageMembers: true,
    consentState: "enabled",
    displayLabel: "בקבלה",
    liveLocation: {
      lat: 39.2512,
      lng: 22.7512,
      accuracyMeters: 12,
      source: "demo"
    },
    updatedMinutesAgo: 1
  },
  {
    id: "noa",
    uuid: demoMemberUuidById.noa,
    displayName: "נועה",
    ageGroup: "child",
    role: "member",
    canChatWithAgent: true,
    canMarkVisited: false,
    canManagePlaces: false,
    canManageMembers: false,
    consentState: "enabled",
    displayLabel: "בחדר",
    liveLocation: {
      lat: 39.2508,
      lng: 22.7517,
      accuracyMeters: 20,
      source: "demo"
    },
    updatedMinutesAgo: 4
  },
  {
    id: "grandma",
    uuid: demoMemberUuidById.grandma,
    displayName: "סבתא",
    ageGroup: "senior",
    role: "viewer",
    canChatWithAgent: true,
    canMarkVisited: false,
    canManagePlaces: false,
    canManageMembers: false,
    consentState: "disabled",
    displayLabel: "מיקום לא משותף",
    liveLocation: null
  }
] as const;
