import type { TripSetupState, TripSetupSubmission, TripSetupStep } from "../domain/types.js";
import {
  getActiveDemoStorageDriverName,
  loadDemoStorage,
  loadDemoStorageAsync,
  saveDemoStorage,
  saveDemoStorageAsync,
  type StoredDemoSetup
} from "./demoStorage.js";
import { DEMO_TRIP_GROUP_UUID } from "./demoRelationalIds.js";
import { ensureDemoRelationalBase } from "./demoRelationalSeed.js";

function getSavedDemoSetup(): StoredDemoSetup | null {
  return loadDemoStorage().setup;
}

async function getSavedDemoSetupAsync(): Promise<StoredDemoSetup | null> {
  const supabaseSetup = await loadSupabaseSetupState();
  if (supabaseSetup !== undefined) {
    return supabaseSetup;
  }

  return (await loadDemoStorageAsync()).setup;
}

function isGoogleMapsViewingLink(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("maps.app.goo.gl") || normalized.includes("google.com/maps");
}

function getSetupReadiness(setup: StoredDemoSetup | null): TripSetupState["readiness"] {
  return {
    hasOwner: Boolean(setup?.tripName.trim()),
    hasMembers: Boolean(setup?.firstMemberName.trim() && typeof setup?.firstMemberAge === "number"),
    hasGoogleSource: Boolean(setup?.googleLink && isGoogleMapsViewingLink(setup.googleLink)),
    hasLocationConsentExplained: Boolean(setup?.locationConsentExplained),
    hasAiPlanExplained: Boolean(setup?.aiPlanConfirmed)
  };
}

function areAllReadinessItemsDone(readiness: TripSetupState["readiness"]) {
  return (
    readiness.hasOwner &&
    readiness.hasMembers &&
    readiness.hasGoogleSource &&
    readiness.hasLocationConsentExplained &&
    readiness.hasAiPlanExplained
  );
}

function getStepStatus(step: TripSetupStep, setupCompleted: boolean): "done" | "current" | "pending" {
  if (setupCompleted) {
    return "done";
  }

  return step === "welcome" ? "current" : "pending";
}

export function buildDemoTripSetupState(): TripSetupState {
  const savedDemoSetup = getSavedDemoSetup();
  return buildDemoTripSetupStateFromSavedSetup(savedDemoSetup);
}

function buildDemoTripSetupStateFromSavedSetup(savedDemoSetup: StoredDemoSetup | null): TripSetupState {
  const readiness = getSetupReadiness(savedDemoSetup);
  const setupCompleted = areAllReadinessItemsDone(readiness);
  const importedPlacesCount = readiness.hasGoogleSource ? 108 : 0;

  return {
    tripGroupId: "group_family_greece_demo",
    currentStep: setupCompleted ? "ready" : "welcome",
    setupCompleted,
    aiPlanMode: "limited",
    setupSummary: savedDemoSetup
      ? {
          tripName: savedDemoSetup.tripName,
          firstMemberName: savedDemoSetup.firstMemberName,
          firstMemberAge: savedDemoSetup.firstMemberAge,
          googleLink: savedDemoSetup.googleLink,
          savedAt: savedDemoSetup.savedAt
        }
      : undefined,
    googleSource: {
      state: readiness.hasGoogleSource ? "demo_link_ready" : "not_connected",
      sourceType: "google_maps_place_list",
      displayName: "Google Maps Place List viewing link",
      importedPlacesCount,
      lastCheckedAt: readiness.hasGoogleSource ? "2026-06-23T05:30:00.000Z" : undefined
    },
    readiness,
    steps: [
      {
        id: "welcome",
        title: "ברוכים הבאים",
        status: getStepStatus("welcome", setupCompleted),
        description: "קודי מסביר מי הוא ואיך מפעילים אותו בתוך שיחת המשפחה."
      },
      {
        id: "ai_plan",
        title: "חשבון והפעלה",
        status: getStepStatus("ai_plan", setupCompleted),
        description: "המערכת פועלת דרך חשבון מנהל הטיול ותקציב API מרכזי."
      },
      {
        id: "trip_group",
        title: "מרחב טיול",
        status: getStepStatus("trip_group", setupCompleted),
        description: "יצירת טיול, מנהל ראשי ותאריכים אם ידועים."
      },
      {
        id: "members",
        title: "חברי הקבוצה",
        status: getStepStatus("members", setupCompleted),
        description: "הוספת שם, גיל או קבוצת גיל, תפקיד והרשאות לכל משתתף."
      },
      {
        id: "google_source",
        title: "חיבור Google",
        status: getStepStatus("google_source", setupCompleted),
        description: "בשלב הנוכחי מדביקים קישור צפייה של Google Maps Place List, בלי כתיבה חזרה לגוגל."
      },
      {
        id: "location",
        title: "מיקום והרשאות",
        status: getStepStatus("location", setupCompleted),
        description: "מיקום חי במפה ושיתוף מיקום קבוצתי רק לאחר הסכמה מפורשת."
      },
      {
        id: "ready",
        title: "מוכנים לטייל",
        status: getStepStatus("ready", setupCompleted),
        description: "קודי מסכם מה מחובר ומה חסר לפני מעבר למפה ולשיחה."
      }
    ],
    kodiWelcomeMessage:
      "אני קודי, מלווה הטיול של הקבוצה. אני קורא את נקודות הטיול, מקשיב לשיחה המשפחתית, מזהה מי פונה אליי, ועוזר לבחור מה נכון לעשות עכשיו. כדי שאוכל לעבוד באמת נחבר מקור Google, נוסיף את חברי הקבוצה, נסביר הרשאות מיקום, ונפעיל חשבון טיול אמיתי דרך מנהל הקבוצה."
  };
}

export function saveDemoTripSetupState(submission: TripSetupSubmission) {
  saveDemoStorage({
    setup: {
      ...submission,
      savedAt: new Date().toISOString()
    }
  });

  return buildDemoTripSetupState();
}

export async function saveDemoTripSetupStateAsync(submission: TripSetupSubmission) {
  const supabaseSetup = await saveSupabaseSetupState(submission);
  if (supabaseSetup) {
    return buildDemoTripSetupStateFromSavedSetup(supabaseSetup);
  }

  await saveDemoStorageAsync({
    setup: {
      ...submission,
      savedAt: new Date().toISOString()
    }
  });

  return buildDemoTripSetupStateAsync();
}

export function resetDemoTripSetupState() {
  saveDemoStorage({ setup: null });
  return buildDemoTripSetupState();
}

export async function resetDemoTripSetupStateAsync() {
  if (await resetSupabaseSetupState()) {
    return buildDemoTripSetupStateFromSavedSetup(null);
  }

  await saveDemoStorageAsync({ setup: null });
  return buildDemoTripSetupStateAsync();
}

export async function buildDemoTripSetupStateAsync(): Promise<TripSetupState> {
  return buildDemoTripSetupStateFromSavedSetup(await getSavedDemoSetupAsync());
}

interface SupabaseSetupRow {
  name: string;
  google_source_url: string | null;
  setup_first_member_name: string | null;
  setup_first_member_age: number | null;
  ai_plan_confirmed: boolean;
  location_consent_explained: boolean;
  setup_saved_at: string | null;
}

function getGoogleSourceState(googleLink: string) {
  return isGoogleMapsViewingLink(googleLink) ? "demo_link_ready" : "not_connected";
}

function mapSupabaseSetupRow(row: SupabaseSetupRow | null): StoredDemoSetup | null {
  if (!row?.setup_saved_at) {
    return null;
  }

  return {
    tripName: row.name,
    firstMemberName: row.setup_first_member_name ?? "",
    firstMemberAge: row.setup_first_member_age ?? undefined,
    googleLink: row.google_source_url ?? "",
    aiPlanConfirmed: row.ai_plan_confirmed,
    locationConsentExplained: row.location_consent_explained,
    savedAt: row.setup_saved_at
  };
}

async function loadSupabaseSetupState(): Promise<StoredDemoSetup | null | undefined> {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return undefined;
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return undefined;
  }

  const { data, error } = await supabase
    .from("trip_groups")
    .select(
      "name, google_source_url, setup_first_member_name, setup_first_member_age, ai_plan_confirmed, location_consent_explained, setup_saved_at"
    )
    .eq("id", DEMO_TRIP_GROUP_UUID)
    .single();

  if (error) {
    throw new Error(`Supabase setup load failed: ${error.message}`);
  }

  return mapSupabaseSetupRow(data as SupabaseSetupRow);
}

async function saveSupabaseSetupState(submission: TripSetupSubmission): Promise<StoredDemoSetup | null> {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return null;
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return null;
  }

  const savedAt = new Date().toISOString();
  const setup: StoredDemoSetup = {
    ...submission,
    savedAt
  };
  const { error } = await supabase
    .from("trip_groups")
    .update({
      name: submission.tripName,
      google_source_url: submission.googleLink,
      google_source_state: getGoogleSourceState(submission.googleLink),
      setup_first_member_name: submission.firstMemberName,
      setup_first_member_age: submission.firstMemberAge,
      ai_plan_confirmed: submission.aiPlanConfirmed,
      location_consent_explained: submission.locationConsentExplained,
      setup_saved_at: savedAt,
      updated_at: savedAt
    })
    .eq("id", DEMO_TRIP_GROUP_UUID);

  if (error) {
    throw new Error(`Supabase setup save failed: ${error.message}`);
  }

  return setup;
}

async function resetSupabaseSetupState() {
  if (getActiveDemoStorageDriverName() !== "supabase") {
    return false;
  }

  const supabase = await ensureDemoRelationalBase();
  if (!supabase) {
    return false;
  }

  const { error } = await supabase
    .from("trip_groups")
    .update({
      name: "צפון יוון",
      google_source_url: null,
      google_source_state: "not_connected",
      setup_first_member_name: null,
      setup_first_member_age: null,
      ai_plan_confirmed: false,
      location_consent_explained: false,
      setup_saved_at: null,
      updated_at: new Date().toISOString()
    })
    .eq("id", DEMO_TRIP_GROUP_UUID);

  if (error) {
    throw new Error(`Supabase setup reset failed: ${error.message}`);
  }

  return true;
}
