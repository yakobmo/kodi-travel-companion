import assert from "node:assert/strict";
import { areRouteEndpointsGrounded } from "../apps/api/dist/agent/routeGrounding.js";

assert.equal(areRouteEndpointsGrounded([], "origin", "destination"), false);
assert.equal(areRouteEndpointsGrounded(["origin"], "origin", "destination"), false);
assert.equal(areRouteEndpointsGrounded(["origin", "destination"], "origin", "destination"), true);

console.log("route grounding regression: ok");
