import type { TripSetupState, TripSetupSubmission, TripSetupStep } from "../domain/types.js";
import { loadDemoStorage, saveDemoStorage, type StoredDemoSetup } from "./demoStorage.js";

function getSavedDemoSetup(): StoredDemoSetup | null {
  return loadDemoStorage().setup;
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
  const readiness = getSetupReadiness(savedDemoSetup);
  const setupCompleted = areAllReadinessItemsDone(readiness);
  const importedPlacesCount = readiness.hasGoogleSource ? 108 : 0;

  return {
    tripGroupId: "group_family_greece_demo",
    currentStep: setupCompleted ? "ready" : "welcome",
    setupCompleted,
    aiPlanMode: savedDemoSetup?.aiPlanConfirmed ? "limited" : "demo",
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
        title: "דמו או הפעלה מלאה",
        status: getStepStatus("ai_plan", setupCompleted),
        description: "המערכת מסבירה שמצב דמו מוגבל ושימוש אמיתי דורש מודל AI או תקציב API מתאים."
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
        description: "ב-MVP מדביקים קישור צפייה של Google Maps Place List, בלי כתיבה חזרה לגוגל."
      },
      {
        id: "location",
        title: "מיקום והרשאות",
        status: getStepStatus("location", setupCompleted),
        description: "GPS אישי ושיתוף מיקום קבוצתי רק לאחר הסכמה מפורשת."
      },
      {
        id: "ready",
        title: "מוכנים לטייל",
        status: getStepStatus("ready", setupCompleted),
        description: "קודי מסכם מה מחובר ומה חסר לפני מעבר למפה ולשיחה."
      }
    ],
    kodiWelcomeMessage:
      "אני קודי, מלווה הטיול של הקבוצה. אני קורא את נקודות הטיול, מקשיב לשיחה המשפחתית, מזהה מי פונה אליי, ועוזר לבחור מה נכון לעשות עכשיו. כדי שאוכל לעבוד באמת נחבר מקור Google, נוסיף את חברי הקבוצה, נסביר הרשאות מיקום, ונבהיר שמצב דמו מוגבל לעומת הפעלה מלאה."
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

export function resetDemoTripSetupState() {
  saveDemoStorage({ setup: null });
  return buildDemoTripSetupState();
}
