import type { AgeGroup, LocationSharingState, MemberRole, TripMemberLocationView } from "../domain/types.js";
import {
  getActiveDemoStorageDriverName,
  loadDemoStorage,
  loadDemoStorageAsync,
  saveDemoStorage,
  saveDemoStorageAsync
} from "./demoStorage.js";
import { DEMO_GROUP_ID, DEMO_TRIP_GROUP_UUID, demoMemberUuidById, demoRelationalMembers } from "./demoRelationalIds.js";
import { ensureDemoRelationalBase } from "./demoRelationalSeed.js";

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

interface SupabaseMemberRow {
  id: string;
  display_name: string;
  role: MemberRole;
  can_chat_with_agent: boolean;
  can_mark_visited: boolean;
  can_manage_places: boolean;
  can_manage_members: boolean;
}

interface SupabaseConsentRow {
  member_id: string;
  state: LocationSharingState;
  updated_at: string;
}

interface SupabaseLiveLocationRow {
  member_id: string;
  lat: number;
  lng: number;
  accuracy_meters: number | null;
  source: "gps" | "demo" | "manual";
  updated_at: string;
}

function getDemoMemberIdByUuid(uuid: string) {
  return Object.entries(demoMemberUuidById).find(([, memberUuid]) => memberUuid === uuid)?.[0];
}

function getSeedUpdatedMinutesAgo(seed: (typeof demoRelationalMembers)[number] | undefined) {
  if (seed && "updatedMinutesAgo" in seed) {
    return seed.updatedMinutesAgo;
  }

  return undefined;
}

async function seedSupabaseLocationStateIfEmpty() {
  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return null;
  }

  const now = new Date().toISOString();
  const { error: consentError } = await supabase.from("location_sharing_consents").upsert(
    demoRelationalMembers.map((member) => ({
      member_id: member.uuid,
      trip_group_id: DEMO_TRIP_GROUP_UUID,
      state: member.consentState,
      updated_at: now
    }))
  );

  if (consentError) {
    throw new Error(`Supabase demo consent seed failed: ${consentError.message}`);
  }

  const { count, error: countError } = await supabase
    .from("live_locations")
    .select("member_id", { count: "exact", head: true })
    .eq("trip_group_id", DEMO_TRIP_GROUP_UUID);

  if (countError) {
    throw new Error(`Supabase demo live location count failed: ${countError.message}`);
  }

  if ((count ?? 0) === 0) {
    const { error: locationError } = await supabase.from("live_locations").insert(
      demoRelationalMembers
        .filter((member) => member.liveLocation)
        .map((member) => ({
          member_id: member.uuid,
          trip_group_id: DEMO_TRIP_GROUP_UUID,
          lat: member.liveLocation?.lat,
          lng: member.liveLocation?.lng,
          accuracy_meters: member.liveLocation?.accuracyMeters,
          source: member.liveLocation?.source,
          updated_at: UPDATED_AT
        }))
    );

    if (locationError) {
      throw new Error(`Supabase demo live location seed failed: ${locationError.message}`);
    }
  }

  return supabase;
}

function mapSupabaseMembers(input: {
  members: SupabaseMemberRow[];
  consents: SupabaseConsentRow[];
  locations: SupabaseLiveLocationRow[];
}): TripMemberLocationView[] {
  const consentByMemberId = new Map(input.consents.map((consent) => [consent.member_id, consent]));
  const locationByMemberId = new Map(input.locations.map((location) => [location.member_id, location]));
  const mappedMembers: TripMemberLocationView[] = [];

  for (const member of input.members) {
    const demoMemberId = getDemoMemberIdByUuid(member.id);
    if (!demoMemberId) {
      continue;
    }

    const seed = demoRelationalMembers.find((item) => item.id === demoMemberId);
    const consent = consentByMemberId.get(member.id);
    const location = locationByMemberId.get(member.id);
    const mappedMember: TripMemberLocationView = {
      member: {
        id: demoMemberId,
        tripGroupId: DEMO_GROUP_ID,
        displayName: member.display_name,
        ageGroup: seed?.ageGroup as AgeGroup | undefined,
        role: member.role,
        canChatWithAgent: member.can_chat_with_agent,
        canMarkVisited: member.can_mark_visited,
        canManagePlaces: member.can_manage_places,
        canManageMembers: member.can_manage_members
      },
      consent: {
        memberId: demoMemberId,
        tripGroupId: DEMO_GROUP_ID,
        state: consent?.state ?? "pending",
        updatedAt: consent?.updated_at ?? UPDATED_AT
      },
      liveLocation: location
        ? {
            memberId: demoMemberId,
            tripGroupId: DEMO_GROUP_ID,
            lat: location.lat,
            lng: location.lng,
            accuracyMeters: location.accuracy_meters ?? undefined,
            updatedAt: location.updated_at,
            source: location.source
          }
        : null,
      displayLabel: location?.source === "gps" ? "GPS אישי" : seed?.displayLabel,
      updatedMinutesAgo: location?.source === "gps" ? 0 : getSeedUpdatedMinutesAgo(seed)
    };

    mappedMembers.push(mappedMember);
  }

  return mappedMembers;
}

async function loadSupabaseTripMembers(): Promise<TripMemberLocationView[] | null> {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return null;
  }

  const supabase = await seedSupabaseLocationStateIfEmpty();
  if (!supabase) {
    return null;
  }

  const [membersResult, consentsResult, locationsResult] = await Promise.all([
    supabase
      .from("trip_members")
      .select("id, display_name, role, can_chat_with_agent, can_mark_visited, can_manage_places, can_manage_members")
      .eq("trip_group_id", DEMO_TRIP_GROUP_UUID),
    supabase.from("location_sharing_consents").select("member_id, state, updated_at").eq("trip_group_id", DEMO_TRIP_GROUP_UUID),
    supabase.from("live_locations").select("member_id, lat, lng, accuracy_meters, source, updated_at").eq("trip_group_id", DEMO_TRIP_GROUP_UUID)
  ]);

  if (membersResult.error) {
    throw new Error(`Supabase members load failed: ${membersResult.error.message}`);
  }
  if (consentsResult.error) {
    throw new Error(`Supabase consents load failed: ${consentsResult.error.message}`);
  }
  if (locationsResult.error) {
    throw new Error(`Supabase live locations load failed: ${locationsResult.error.message}`);
  }

  return mapSupabaseMembers({
    members: membersResult.data as SupabaseMemberRow[],
    consents: consentsResult.data as SupabaseConsentRow[],
    locations: locationsResult.data as SupabaseLiveLocationRow[]
  });
}

async function resetSupabaseTripMembers(): Promise<TripMemberLocationView[] | null> {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return null;
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return null;
  }

  const { error: locationDeleteError } = await supabase
    .from("live_locations")
    .delete()
    .eq("trip_group_id", DEMO_TRIP_GROUP_UUID);
  if (locationDeleteError) {
    throw new Error(`Supabase live locations reset failed: ${locationDeleteError.message}`);
  }

  const { error: consentDeleteError } = await supabase
    .from("location_sharing_consents")
    .delete()
    .eq("trip_group_id", DEMO_TRIP_GROUP_UUID);
  if (consentDeleteError) {
    throw new Error(`Supabase consents reset failed: ${consentDeleteError.message}`);
  }

  await seedSupabaseLocationStateIfEmpty();
  return loadSupabaseTripMembers();
}

async function updateSupabaseMemberLocation(input: {
  memberId: string;
  lat: number;
  lng: number;
  accuracyMeters?: number;
}) {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return null;
  }

  const supabaseMembers = await loadSupabaseTripMembers();
  if (!supabaseMembers) {
    return null;
  }

  const member = supabaseMembers.find((item) => item.member.id === input.memberId);
  if (!member) {
    return { ok: false as const, error: "member_not_found" };
  }

  if (member.consent.state !== "enabled") {
    return { ok: false as const, error: "location_sharing_not_enabled" };
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return null;
  }

  const updatedAt = new Date().toISOString();
  const { error } = await supabase.from("live_locations").upsert({
    member_id: demoMemberUuidById[input.memberId],
    trip_group_id: DEMO_TRIP_GROUP_UUID,
    lat: input.lat,
    lng: input.lng,
    accuracy_meters: input.accuracyMeters,
    source: "gps",
    updated_at: updatedAt
  });

  if (error) {
    throw new Error(`Supabase live location update failed: ${error.message}`);
  }

  const updatedMembers = await loadSupabaseTripMembers();
  const updatedMember = updatedMembers?.find((item) => item.member.id === input.memberId);
  return updatedMember
    ? { ok: true as const, member: structuredClone(updatedMember) }
    : { ok: false as const, error: "member_not_found" };
}

export function loadDemoTripMembers(): TripMemberLocationView[] {
  return structuredClone(getStoredOrInitialMembers());
}

async function getStoredOrInitialMembersAsync() {
  const supabaseMembers = await loadSupabaseTripMembers();
  if (supabaseMembers) {
    return supabaseMembers;
  }

  return (await loadDemoStorageAsync()).members ?? initialDemoMembers;
}

export async function loadDemoTripMembersAsync(): Promise<TripMemberLocationView[]> {
  return structuredClone(await getStoredOrInitialMembersAsync());
}

export function resetDemoTripMembers() {
  saveDemoStorage({ members: null });
  return loadDemoTripMembers();
}

export async function resetDemoTripMembersAsync() {
  const supabaseMembers = await resetSupabaseTripMembers();
  if (supabaseMembers) {
    return structuredClone(supabaseMembers);
  }

  await saveDemoStorageAsync({ members: null });
  return loadDemoTripMembersAsync();
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

export async function updateDemoMemberLocationAsync(input: {
  memberId: string;
  lat: number;
  lng: number;
  accuracyMeters?: number;
}) {
  const supabaseResult = await updateSupabaseMemberLocation(input);
  if (supabaseResult) {
    return supabaseResult;
  }

  const demoMembers = await loadDemoTripMembersAsync();
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
    displayLabel: "GPS ׳׳™׳©׳™",
    updatedMinutesAgo: 0
  };

  await saveDemoStorageAsync({ members: demoMembers });
  return { ok: true as const, member: structuredClone(demoMembers[memberIndex]) };
}
