import assert from "node:assert/strict";
import {
  areRouteEndpointsGrounded,
  getExplicitlyMentionedPlaceIds,
  getRouteGroundedPlaceIds
} from "../apps/api/dist/agent/routeGrounding.js";

assert.equal(areRouteEndpointsGrounded([], "origin", "destination"), false);
assert.equal(areRouteEndpointsGrounded(["origin"], "origin", "destination"), false);
assert.equal(areRouteEndpointsGrounded(["origin", "destination"], "origin", "destination"), true);

const grounded = getRouteGroundedPlaceIds(
  "הלינה האחרונה היא Kalamiotou 19-23. חשב משם לנמל תעופה",
  [
    { id: "athens-stay", name: "Kalamiotou 19-23", note: "לילה אחרון באתונה" },
    { id: "airport", name: "נמל התעופה הבינלאומי אתונה-אלפתריוס וניזלוס" },
    { id: "waterfall", name: "מפלי קויאסה", note: "עצירה בטיול" }
  ]
);
assert.deepEqual([...grounded].sort(), ["airport", "athens-stay"]);
assert.equal(areRouteEndpointsGrounded(grounded, "athens-stay", "airport"), true);
assert.equal(areRouteEndpointsGrounded(grounded, "waterfall", "airport"), false);

const explicit = getExplicitlyMentionedPlaceIds(
  "הלינה היא Kalamiotou 19-23 ומשם לנמל תעופה",
  [
    { id: "athens-stay", name: "Kalamiotou 19-23" },
    { id: "airport", name: "נמל התעופה הבינלאומי אתונה" },
    { id: "other-stay", name: "Hotel Marathia", note: "לינה אחרונה" }
  ]
);
assert.deepEqual([...explicit], ["athens-stay"]);
assert.equal(areRouteEndpointsGrounded(["athens-stay", "airport", "other-stay"], "other-stay", "airport", explicit), false);
assert.equal(areRouteEndpointsGrounded(["athens-stay", "airport", "other-stay"], "athens-stay", "airport", explicit), true);

console.log("route grounding regression: ok");
