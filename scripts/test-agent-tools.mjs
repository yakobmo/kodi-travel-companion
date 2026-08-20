import assert from "node:assert/strict";
import { parseKodiToolRequest, parseOpenAiKodiToolCall } from "../apps/api/dist/agent/agentTools.js";

assert.deepEqual(parseKodiToolRequest({
  type: "route",
  originPlaceId: "origin",
  destinationPlaceId: "destination",
  travelMode: "WALK"
}), {
  type: "route",
  originPlaceId: "origin",
  destinationPlaceId: "destination",
  travelMode: "WALK"
});
assert.equal(parseKodiToolRequest({ type: "route", originPlaceId: "same", destinationPlaceId: "same" }), undefined);
assert.deepEqual(parseKodiToolRequest({ type: "trip_memory", placeIds: ["a", 4, "b"] }), {
  type: "trip_memory",
  placeIds: ["a", "b"]
});
assert.deepEqual(parseKodiToolRequest({ type: "places_search", query: "  cafe nearby  ", radiusMeters: 100_000 }), {
  type: "places_search",
  query: "cafe nearby",
  anchorPlaceId: undefined,
  radiusMeters: 50_000
});
assert.deepEqual(parseKodiToolRequest({ type: "member_locations", scope: "member", memberName: "  אורייה " }), {
  type: "member_locations",
  scope: "member",
  memberName: "אורייה"
});
assert.deepEqual(parseKodiToolRequest({ type: "map_action", placeIds: ["a", "a", 4, "b"], title: "  מסלול חוף  " }), {
  type: "map_action",
  placeIds: ["a", "b"],
  title: "מסלול חוף"
});
assert.equal(parseKodiToolRequest({ type: "map_action", placeIds: [] }), undefined);
assert.equal(parseKodiToolRequest({ type: "unknown" }), undefined);
assert.deepEqual(parseOpenAiKodiToolCall({
  function: { name: "places_search", arguments: JSON.stringify({ query: "cafe", radiusMeters: 1500 }) }
}), {
  type: "places_search",
  query: "cafe",
  anchorPlaceId: undefined,
  radiusMeters: 1500
});

console.log("agent tool registry regression: ok");
