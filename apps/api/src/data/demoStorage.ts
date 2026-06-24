import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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
const DEMO_STORAGE_KEY = "group_family_greece_demo";

function getRequestedStorageDriver(): StorageDriverName {
  return process.env.STORAGE_DRIVER === "supabase" ? "supabase" : "file";
}

function hasSupabaseServerConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function createSupabaseServerClient(): SupabaseClient | null {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
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

async function loadSupabaseStorage(client: SupabaseClient): Promise<DemoStorageState> {
  const { data, error } = await client
    .from("demo_storage_states")
    .select("state")
    .eq("storage_key", DEMO_STORAGE_KEY)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase storage load failed: ${error.message}`);
  }

  if (!data?.state) {
    return createEmptyState();
  }

  return {
    ...createEmptyState(),
    ...(data.state as Partial<DemoStorageState>),
    version: 1
  };
}

async function saveSupabaseStorage(
  client: SupabaseClient,
  update: Partial<Omit<DemoStorageState, "version" | "updatedAt">>
): Promise<DemoStorageState> {
  const nextState: DemoStorageState = {
    ...(await loadSupabaseStorage(client)),
    ...update,
    version: 1,
    updatedAt: new Date().toISOString()
  };

  const { error } = await client.from("demo_storage_states").upsert({
    storage_key: DEMO_STORAGE_KEY,
    state: nextState,
    updated_at: nextState.updatedAt
  });

  if (error) {
    throw new Error(`Supabase storage save failed: ${error.message}`);
  }

  return nextState;
}

export async function loadDemoStorageAsync(): Promise<DemoStorageState> {
  if (getRequestedStorageDriver() !== "supabase") {
    return loadDemoStorage();
  }

  const client = createSupabaseServerClient();
  if (!client) {
    return loadDemoStorage();
  }

  return loadSupabaseStorage(client);
}

export async function saveDemoStorageAsync(update: Partial<Omit<DemoStorageState, "version" | "updatedAt">>) {
  if (getRequestedStorageDriver() !== "supabase") {
    return saveDemoStorage(update);
  }

  const client = createSupabaseServerClient();
  if (!client) {
    return saveDemoStorage(update);
  }

  return saveSupabaseStorage(client, update);
}

export async function verifySupabaseBridgeStorage() {
  const client = createSupabaseServerClient();
  if (!client) {
    return {
      configured: false,
      writable: false,
      readable: false
    };
  }

  const previousState = await loadSupabaseStorage(client);
  const verifiedAt = new Date().toISOString();
  const nextState = await saveSupabaseStorage(client, {
    ...previousState,
    setup: previousState.setup,
    messages: previousState.messages,
    members: previousState.members,
    groupDestination: previousState.groupDestination,
    groupRoute: previousState.groupRoute
  });
  const reloadedState = await loadSupabaseStorage(client);

  return {
    configured: true,
    writable: nextState.updatedAt.length > 0,
    readable: reloadedState.version === 1,
    verifiedAt
  };
}

export function getDemoStorageMetadata() {
  const requestedDriver = getRequestedStorageDriver();

  return {
    driver: "file",
    requestedDriver,
    storagePath,
    supabaseConfigured: hasSupabaseServerConfig(),
    supabaseBridgeReady: requestedDriver === "supabase" && hasSupabaseServerConfig(),
    realtimeReady: false,
    migrationTarget: "managed_db_plus_realtime",
    note:
      requestedDriver === "supabase"
        ? "Supabase bridge storage can be verified separately; the live MVP still uses file storage until all read/write paths are migrated."
        : "File storage is active for the MVP demo."
  };
}
