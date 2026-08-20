import assert from "node:assert/strict";
import { buildKodiContext } from "../apps/api/dist/agent/kodiContext.js";
import { buildAgentToolEvidence, validateAgentEvidenceClaims } from "../apps/api/dist/agent/toolEvidence.js";

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
    }
  ],
  members: [],
  agentContext: { visibleLiveLocationMemberIds: [] }
};

const context = buildKodiContext({ message: "מהמלון ביום האחרון לשדה?", tripState });
assert.equal(context.placeDirectory[0].note, "9.9-10.9, יציאה לשדה התעופה");
assert.equal(context.placeDirectory[0].address, "Kalamiotou 19-23");
assert.deepEqual(context.placeDirectory[0].tags, ["לינה", "יום אחרון"]);

const noTools = buildAgentToolEvidence({ message: "כמה זמן נסיעה?" });
assert.throws(
  () => validateAgentEvidenceClaims({ author: "קודי", text: "בדקתי עכשיו במסלול וזה לוקח שעה", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, noTools),
  /ai_reply_claims_unexecuted_route_tool/
);
assert.throws(
  () => validateAgentEvidenceClaims({ author: "קודי", text: "אימצתי את זה ככלל קבוע בזיכרון", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, noTools),
  /ai_reply_claims_unavailable_persistent_memory/
);

const withRoute = buildAgentToolEvidence({
  message: "כמה זמן נסיעה?",
  routeEstimate: { status: "ready", route: { distanceMeters: 1000, durationSeconds: 600, polyline: "" } }
});
assert.doesNotThrow(() =>
  validateAgentEvidenceClaims({ author: "קודי", text: "בדקתי במסלול: עשר דקות", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, withRoute)
);

assert.doesNotThrow(() =>
  validateAgentEvidenceClaims({ author: "קודי", text: "לפי ההיגיון שלי זו אפשרות מעניינת, אבל זו לא בדיקת מסלול.", intent: "general", requiresAdminApproval: false, source: "ai_provider" }, noTools)
);

console.log("agent tool evidence regression: ok");

