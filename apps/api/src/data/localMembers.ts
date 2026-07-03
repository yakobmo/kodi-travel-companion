import { randomUUID } from "node:crypto";
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
      displayName: "מנהל נוסף",
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
      displayName: "מנהל הטיול",
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
      displayName: "משתתף צעיר",
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
      displayName: "משתתף",
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
  age?: number | null;
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

function getAppMemberIdByUuid(uuid: string) {
  return getDemoMemberIdByUuid(uuid) ?? uuid;
}

function getSupabaseMemberUuidByAppId(memberId: string) {
  return demoMemberUuidById[memberId] ?? memberId;
}

function isOwnerLike(member: TripMemberLocationView | undefined) {
  return member?.member.role === "owner" || member?.member.role === "admin" || member?.member.canManageMembers === true;
}

function ageToAgeGroup(age?: number | null): AgeGroup | undefined {
  if (typeof age !== "number" || !Number.isFinite(age)) {
    return undefined;
  }

  if (age < 13) {
    return "child";
  }
  if (age < 18) {
    return "teen";
  }
  if (age >= 65) {
    return "senior";
  }

  return "adult";
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
    const demoMemberId = getAppMemberIdByUuid(member.id);

    const seed = demoRelationalMembers.find((item) => item.id === demoMemberId);
    const consent = consentByMemberId.get(member.id);
    const location = locationByMemberId.get(member.id);
    const mappedMember: TripMemberLocationView = {
      member: {
        id: demoMemberId,
        tripGroupId: DEMO_GROUP_ID,
        displayName: seed?.displayName ?? member.display_name,
        ageGroup: (seed?.ageGroup as AgeGroup | undefined) ?? ageToAgeGroup(member.age),
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
      displayLabel: location?.source === "gps" ? "מיקום חי במפה" : seed?.displayLabel,
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
      .select("id, display_name, age, role, can_chat_with_agent, can_mark_visited, can_manage_places, can_manage_members")
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
    member_id: getSupabaseMemberUuidByAppId(input.memberId),
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

async function addSupabaseTripMember(input: {
  displayName: string;
  ageGroup: AgeGroup;
  age?: number;
  role?: MemberRole;
}): Promise<TripMemberLocationView | null> {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return null;
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return null;
  }

  const memberUuid = randomUUID();
  const role = input.role ?? "member";
  const { data, error } = await supabase
    .from("trip_members")
    .insert({
      id: memberUuid,
      trip_group_id: DEMO_TRIP_GROUP_UUID,
      display_name: input.displayName,
      age: input.age,
      role,
      can_chat_with_agent: true,
      can_mark_visited: role === "owner" || role === "admin",
      can_manage_places: role === "owner" || role === "admin",
      can_manage_members: role === "owner" || role === "admin"
    })
    .select("id, display_name, age, role, can_chat_with_agent, can_mark_visited, can_manage_places, can_manage_members")
    .single();

  if (error) {
    throw new Error(`Supabase member insert failed: ${error.message}`);
  }

  const now = new Date().toISOString();
  const { error: consentError } = await supabase.from("location_sharing_consents").upsert({
    member_id: memberUuid,
    trip_group_id: DEMO_TRIP_GROUP_UUID,
    state: "disabled",
    updated_at: now
  });

  if (consentError) {
    throw new Error(`Supabase member consent insert failed: ${consentError.message}`);
  }

  const row = data as SupabaseMemberRow;
  return {
    member: {
      id: memberUuid,
      tripGroupId: DEMO_GROUP_ID,
      displayName: row.display_name,
      ageGroup: input.ageGroup,
      role: row.role,
      canChatWithAgent: row.can_chat_with_agent,
      canMarkVisited: row.can_mark_visited,
      canManagePlaces: row.can_manage_places,
      canManageMembers: row.can_manage_members
    },
    consent: {
      memberId: memberUuid,
      tripGroupId: DEMO_GROUP_ID,
      state: "disabled",
      updatedAt: now
    },
    liveLocation: null,
    displayLabel: "מיקום לא משותף"
  };
}

async function removeSupabaseTripMember(input: { memberId: string; actorMemberId: string }) {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return null;
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return null;
  }

  const members = (await loadSupabaseTripMembers()) ?? [];
  const actor = members.find((item) => item.member.id === input.actorMemberId);
  const target = members.find((item) => item.member.id === input.memberId);

  if (!target) {
    return { ok: false as const, error: "member_not_found" };
  }

  if (target.member.role === "owner") {
    return { ok: false as const, error: "owner_cannot_leave" };
  }

  if (input.actorMemberId !== input.memberId && !isOwnerLike(actor)) {
    return { ok: false as const, error: "not_allowed" };
  }

  const { error } = await supabase.from("trip_members").delete().eq("id", getSupabaseMemberUuidByAppId(input.memberId));
  if (error) {
    throw new Error(`Supabase member delete failed: ${error.message}`);
  }

  return { ok: true as const, members: await loadDemoTripMembersAsync() };
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

export async function addDemoTripMemberAsync(input: {
  displayName: string;
  ageGroup: AgeGroup;
  age?: number;
  role?: MemberRole;
}): Promise<TripMemberLocationView> {
  const supabaseMember = await addSupabaseTripMember(input);
  if (supabaseMember) {
    return structuredClone(supabaseMember);
  }

  const memberId = `guest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const role = input.role ?? "member";
  const member: TripMemberLocationView = {
    member: {
      id: memberId,
      tripGroupId: DEMO_GROUP_ID,
      displayName: input.displayName,
      ageGroup: input.ageGroup,
      role,
      canChatWithAgent: true,
      canMarkVisited: role === "owner" || role === "admin",
      canManagePlaces: role === "owner" || role === "admin",
      canManageMembers: role === "owner" || role === "admin"
    },
    consent: {
      memberId,
      tripGroupId: DEMO_GROUP_ID,
      state: "disabled",
      updatedAt: now
    },
    liveLocation: null,
    displayLabel: "מיקום לא משותף"
  };

  const members = await loadDemoTripMembersAsync();
  await saveDemoStorageAsync({ members: [...members, member] });
  return structuredClone(member);
}

export async function removeDemoTripMemberAsync(input: { memberId: string; actorMemberId: string }) {
  const supabaseResult = await removeSupabaseTripMember(input);
  if (supabaseResult) {
    return supabaseResult;
  }

  const members = await loadDemoTripMembersAsync();
  const actor = members.find((item) => item.member.id === input.actorMemberId);
  const target = members.find((item) => item.member.id === input.memberId);

  if (!target) {
    return { ok: false as const, error: "member_not_found" };
  }

  if (target.member.role === "owner") {
    return { ok: false as const, error: "owner_cannot_leave" };
  }

  if (input.actorMemberId !== input.memberId && !isOwnerLike(actor)) {
    return { ok: false as const, error: "not_allowed" };
  }

  const nextMembers = members.filter((item) => item.member.id !== input.memberId);
  await saveDemoStorageAsync({ members: nextMembers });
  return { ok: true as const, members: structuredClone(nextMembers) };
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
    displayLabel: "מיקום חי במפה",
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
    displayLabel: "מיקום חי במפה",
    updatedMinutesAgo: 0
  };

  await saveDemoStorageAsync({ members: demoMembers });
  return { ok: true as const, member: structuredClone(demoMembers[memberIndex]) };
}
