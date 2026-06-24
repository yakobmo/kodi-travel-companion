import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { TripMemberLocationView, TripSetupSubmission } from "../domain/types.js";

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
  return process.env.STORAGE_DRIVER === "supabase" ? "supabase" : "file";
}

function hasSupabaseServerConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
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

export function getDemoStorageMetadata() {
  const requestedDriver = getRequestedStorageDriver();

  return {
    driver: "file",
    requestedDriver,
    storagePath,
    supabaseConfigured: hasSupabaseServerConfig(),
    realtimeReady: false,
    migrationTarget: "managed_db_plus_realtime",
    note:
      requestedDriver === "supabase"
        ? "Supabase schema gate exists, but the runtime driver is not implemented yet; file storage remains active."
        : "File storage is active for the MVP demo."
  };
}
