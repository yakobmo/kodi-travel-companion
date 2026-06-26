import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TripMemberLocationView, TripSetupSubmission } from "../domain/types.js";
import { hasSupabaseServerConfig } from "./supabaseClient.js";

export interface StoredDemoMessage {
  id: string;
  tripGroupId: string;
  author: string;
  text: string;
  memberId?: string;
  source: "member" | "agent" | "system";
  createdAt: string;
}

export interface StoredDemoSetup extends TripSetupSubmission {
  savedAt: string;
}

export interface StoredGroupDestination {
  tripGroupId: string;
  placeId: string;
  placeName: string;
  address?: string;
  lat?: number;
  lng?: number;
  setByMemberId: string;
  setByName: string;
  setAt: string;
}

export interface StoredGroupRouteStop {
  placeId: string;
  placeName: string;
  address?: string;
  lat?: number;
  lng?: number;
  order: number;
}

export interface StoredGroupRoute {
  tripGroupId: string;
  routeId: string;
  title: string;
  stops: StoredGroupRouteStop[];
  activeStopIndex: number;
  completedStopIds: string[];
  createdByMemberId: string;
  createdByName: string;
  createdAt: string;
  status: "draft" | "approved" | "completed";
}

export interface DemoStorageState {
  version: 1;
  updatedAt: string;
  setup: StoredDemoSetup | null;
  members: TripMemberLocationView[] | null;
  messages: StoredDemoMessage[] | null;
  groupDestination: StoredGroupDestination | null;
  groupRoute: StoredGroupRoute | null;
}

export interface DemoStorageDriver {
  load(): DemoStorageState;
  save(update: Partial<Omit<DemoStorageState, "version" | "updatedAt">>): DemoStorageState;
}

type StorageDriverName = "file" | "supabase";

const storagePath = join(process.cwd(), ".data", "demo-state.json");

function getRequestedStorageDriver(): StorageDriverName {
  if (process.env.STORAGE_DRIVER === "supabase" || process.env.STORAGE_DRIVER === "file") {
    return process.env.STORAGE_DRIVER;
  }

  return process.env.NODE_ENV === "production" && hasSupabaseServerConfig() ? "supabase" : "file";
}

export function getActiveDemoStorageDriverName(): StorageDriverName {
  const requestedDriver = getRequestedStorageDriver();
  return requestedDriver === "supabase" && hasSupabaseServerConfig() ? "supabase" : "file";
}

function createEmptyState(): DemoStorageState {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    setup: null,
    members: null,
    messages: null,
    groupDestination: null,
    groupRoute: null
  };
}

function ensureStorageDirectory() {
  mkdirSync(dirname(storagePath), { recursive: true });
}

const fileDemoStorageDriver: DemoStorageDriver = {
  load() {
    if (!existsSync(storagePath)) {
      return createEmptyState();
    }

    try {
      const parsed = JSON.parse(readFileSync(storagePath, "utf8")) as Partial<DemoStorageState>;
      return {
        ...createEmptyState(),
        ...parsed,
        version: 1
      };
    } catch {
      return createEmptyState();
    }
  },
  save(update) {
    ensureStorageDirectory();
    const nextState: DemoStorageState = {
      ...fileDemoStorageDriver.load(),
      ...update,
      version: 1,
      updatedAt: new Date().toISOString()
    };
    writeFileSync(storagePath, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
    return nextState;
  }
};

export const activeDemoStorageDriver: DemoStorageDriver = fileDemoStorageDriver;

export function loadDemoStorage(): DemoStorageState {
  return activeDemoStorageDriver.load();
}

export function saveDemoStorage(update: Partial<Omit<DemoStorageState, "version" | "updatedAt">>) {
  return activeDemoStorageDriver.save(update);
}

export async function loadDemoStorageAsync(): Promise<DemoStorageState> {
  return loadDemoStorage();
}

export async function saveDemoStorageAsync(update: Partial<Omit<DemoStorageState, "version" | "updatedAt">>) {
  return saveDemoStorage(update);
}

export function getDemoStorageMetadata() {
  const requestedDriver = getRequestedStorageDriver();
  const supabaseConfigured = hasSupabaseServerConfig();
  const activeDriver = getActiveDemoStorageDriverName();

  return {
    driver: activeDriver,
    requestedDriver,
    storagePath,
    supabaseConfigured,
    relationalStorageReady: activeDriver === "supabase",
    jsonBridgeActive: false,
    realtimeReady: activeDriver === "supabase",
    migrationTarget: "relational_supabase_plus_realtime",
    note:
      activeDriver === "supabase"
        ? "Relational Supabase storage is active for the MVP demo; local demo-state JSON is fallback only."
        : requestedDriver === "supabase"
          ? "Supabase storage was requested, but server configuration is missing; file storage is active as fallback."
        : "File storage is active for the MVP demo."
  };
}
