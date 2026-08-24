import assert from "node:assert/strict";
import { parseKodiToolRequest, parseOpenAiKodiToolCall, parseOpenAiResponsesKodiToolCall } from "../apps/api/dist/agent/agentTools.js";

assert.deepEqual(parseKodiToolRequest({
  type: "route",
  stops: ["origin", "Prionia, Mount Olympus", "destination"],
  travelMode: "WALK"
}), {
  type: "route",
  stops: ["origin", "Prionia, Mount Olympus", "destination"],
  travelMode: "WALK"
});
assert.equal(parseKodiToolRequest({ type: "route", originPlaceId: "same", destinationPlaceId: "same" }), undefined);
assert.deepEqual(parseKodiToolRequest({ type: "search_trip_places", query: "  lodging tomorrow  ", placeTypes: ["lodging", "lodging"], limit: 100 }), {
  type: "search_trip_places",
  query: "lodging tomorrow",
  placeTypes: ["lodging"],
  referencePlaceId: undefined,
  radiusMeters: undefined,
  limit: 60
});
assert.deepEqual(parseKodiToolRequest({ type: "search_trip_places" }), {
  type: "search_trip_places",
  query: undefined,
  placeTypes: undefined,
  referencePlaceId: undefined,
  radiusMeters: undefined,
  limit: 20
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
assert.deepEqual(parseOpenAiResponsesKodiToolCall({
  type: "function_call",
  name: "search_trip_places",
  arguments: JSON.stringify({ query: "hotel", limit: 10 }),
  call_id: "call_123"
}), {
  request: {
    type: "search_trip_places",
    query: "hotel",
    placeTypes: undefined,
    referencePlaceId: undefined,
    radiusMeters: undefined,
    limit: 10
  },
  callId: "call_123"
});

console.log("agent tool registry regression: ok");
