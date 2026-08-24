import assert from "node:assert/strict";
import { buildKodiContext } from "../apps/api/dist/agent/kodiContext.js";
import { buildAgentToolEvidence, validateAgentEvidenceClaims } from "../apps/api/dist/agent/toolEvidence.js";
import { searchTripPlaces } from "../apps/api/dist/agent/tripLookup.js";

const tripState = {
  trip: { id: "trip", groupId: "group", name: "טיול" },
  summary: {},
  places: [
    {
      id: "athens-last-night",
      tripId: "trip",
      tripGroupId: "group",
      name: "לילה אחרון באתונה",
      type: "lodging",
      address: "Kalamiotou 19-23",
      note: "9.9-10.9, יציאה לשדה התעופה",
      tags: ["לינה", "יום אחרון"],
      sourceIndex: 106,
      lat: 37.98,
      lng: 23.72,
      visitState: "unvisited"
    },
    {
      id: "nearby-cafe",
      tripId: "trip",
      tripGroupId: "group",
      name: "קפה ליד המלון",
      type: "food",
      address: "Athens",
      note: "ארוחת בוקר",
      tags: ["קפה"],
      sourceIndex: 107,
      lat: 37.981,
      lng: 23.721,
      visitState: "unvisited"
    }
  ],
  members: [],
  agentContext: { visibleLiveLocationMemberIds: [] }
};

const context = buildKodiContext({
  message: "מהמלון ביום האחרון לשדה?",
  tripState,
  tripLookupResult: { query: "לילה אחרון", matches: tripState.places, itinerary: [], stayCalendar: [] }
});
assert.equal(context.appSurface.managementMenu.kind, "hamburger_menu");
assert.equal(context.appSurface.savedTripPoints.retrievalTool, "search_trip_places");
assert.deepEqual(context.placeDirectory[0], {
  id: "athens-last-night",
  name: "לילה אחרון באתונה",
  type: "lodging"
});
assert.equal(context.relevantPlaceDetails[0].note, "9.9-10.9, יציאה לשדה התעופה");
assert.equal(context.relevantPlaceDetails[0].address, "Kalamiotou 19-23");

const allSaved = searchTripPlaces(tripState, { limit: 60 });
assert.equal(allSaved.totalMatches, 2);
assert.equal(allSaved.matches.length, 2);
const nearLodging = searchTripPlaces(tripState, {
  referencePlaceId: "athens-last-night",
  radiusMeters: 500,
  limit: 20
});
assert.deepEqual(nearLodging.matches.map((place) => place.id), ["athens-last-night", "nearby-cafe"]);
assert.equal(nearLodging.matches[0].distanceFromReferenceMeters, 0);
assert.ok(nearLodging.matches[1].distanceFromReferenceMeters > 0);
const cafes = searchTripPlaces(tripState, { query: "קפה", limit: 20 });
assert.deepEqual(cafes.matches.map((place) => place.id), ["nearby-cafe"]);

const noTools = buildAgentToolEvidence({ message: "כמה זמן נסיעה?" });
assert.equal(noTools.tripPlaces.status, "not_run");
assert.throws(
  () => validateAgentEvidenceClaims({ author: "קודי", text: "בדקתי וזה מאומת", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, noTools),
  /ai_reply_claims_unexecuted_check/
);
assert.throws(
  () => validateAgentEvidenceClaims({ author: "קודי", text: "זה במרחק 20 דקות הליכה", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, noTools),
  /ai_reply_unverified_route_measurement/
);
assert.throws(
  () => validateAgentEvidenceClaims({ author: "קודי", text: "בדקתי עכשיו במסלול וזה לוקח שעה", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, noTools),
  /ai_reply_claims_unexecuted_route_tool/
);
assert.throws(
  () => validateAgentEvidenceClaims({ author: "קודי", text: "אימצתי את זה ככלל קבוע בזיכרון", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, noTools),
  /ai_reply_claims_unavailable_persistent_memory/
);
assert.throws(
  () => validateAgentEvidenceClaims({ author: "קודי", text: "אני מזיז את הנקודה לקטגוריית מקומות הלינה", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, noTools),
  /ai_reply_claims_unexecuted_state_mutation/
);
assert.throws(
  () => validateAgentEvidenceClaims({ author: "קודי", text: "הבנתי. אני מזיז את זה לשם.", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, noTools),
  /ai_reply_claims_unexecuted_state_mutation/
);
assert.throws(
  () => validateAgentEvidenceClaims({ author: "קודי", text: "סימנתי את המסלול במפה", intent: "route_creation", requiresAdminApproval: false, source: "ai_provider" }, noTools),
  /ai_reply_claims_unexecuted_state_mutation/
);

const withRoute = buildAgentToolEvidence({
  message: "כמה זמן נסיעה?",
  routeEstimate: { status: "ready", route: { distanceMeters: 1000, durationSeconds: 600, polyline: "" } }
});
assert.doesNotThrow(() =>
  validateAgentEvidenceClaims({ author: "קודי", text: "בדקתי במסלול: עשר דקות", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, withRoute)
);

const withTripSearch = buildAgentToolEvidence({
  message: "מה שמור?",
  tripSearchExecuted: true,
  tripLookupResult: { query: "", matches: [], itinerary: [], stayCalendar: [] }
});
assert.equal(withTripSearch.tripPlaces.status, "ready");
assert.doesNotThrow(() =>
  validateAgentEvidenceClaims({ author: "קודי", text: "בדקתי בנקודות הטיול", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, withTripSearch)
);
assert.doesNotThrow(() =>
  validateAgentEvidenceClaims({ author: "קודי", text: "הגשר נמצא במרחק 5.7 ק״מ בקו אווירי", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, withTripSearch)
);
assert.throws(
  () => validateAgentEvidenceClaims({ author: "קודי", text: "הגשר נמצא במרחק 5.7 ק״מ נסיעה", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, withTripSearch),
  /ai_reply_unverified_route_measurement/
);

const withMutation = buildAgentToolEvidence({
  message: "סמן במפה",
  stateMutationResult: { status: "completed", kind: "route", placeNames: ["א", "ב"] }
});
assert.doesNotThrow(() =>
  validateAgentEvidenceClaims({ author: "קודי", text: "סימנתי את המסלול והוא נשמר במפת הטיול", intent: "route_creation", requiresAdminApproval: false, source: "ai_provider" }, withMutation)
);

assert.doesNotThrow(() =>
  validateAgentEvidenceClaims({ author: "קודי", text: "לפי ההיגיון שלי זו אפשרות מעניינת, אבל זו לא בדיקת מסלול.", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, noTools)
);

console.log("agent tool evidence regression: ok");
