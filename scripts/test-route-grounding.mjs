import assert from "node:assert/strict";
import { areRouteEndpointsGrounded, getRouteGroundedPlaceIds } from "../apps/api/dist/agent/routeGrounding.js";

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

console.log("route grounding regression: ok");
