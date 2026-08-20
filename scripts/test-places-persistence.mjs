import assert from "node:assert/strict";
import { getStaleSourcePlaceIds, isCompletePersistedPlacesSnapshot } from "../apps/api/dist/data/localPlaces.js";

assert.equal(isCompletePersistedPlacesSnapshot(3, 107), false);
assert.equal(isCompletePersistedPlacesSnapshot(52, 107), false);
assert.equal(isCompletePersistedPlacesSnapshot(53, 107), true);
assert.equal(isCompletePersistedPlacesSnapshot(87, 107), true);
assert.deepEqual(getStaleSourcePlaceIds(["a", "b", "c"], ["b", "c", "d"]), ["a"]);
assert.deepEqual(getStaleSourcePlaceIds(["a", "b"], ["a", "b"]), []);

console.log("places persistence regression: ok");
