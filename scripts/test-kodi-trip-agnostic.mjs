#!/usr/bin/env node

import { resolveTripReferenceForMessage } from "../apps/api/dist/agent/tripReferenceResolver.js";

const tripState = {
  trip: { id: "trip_austria", groupId: "group_alps", name: "Austria", groupName: "Alps family" },
  summary: { name: "Austria", groupName: "Alps family" },
  places: [
    {
      id: "vienna-hotel",
      name: "Vienna Central Hotel",
      type: "lodging",
      lat: 48.2082,
      lng: 16.3738,
      sourceIndex: 1,
      tags: [],
      visitState: "planned"
    },
    {
      id: "salzburg-fortress",
      name: "Hohensalzburg Fortress",
      type: "attraction",
      lat: 47.7952,
      lng: 13.0477,
      sourceIndex: 2,
      tags: [],
      visitState: "planned"
    }
  ],
  members: [],
  lodgingTimeline: []
};

const firstHotel = resolveTripReferenceForMessage("מה המלון הראשון?", tripState);
if (firstHotel.destination?.label !== "Vienna Central Hotel" || firstHotel.destination.source !== "first_lodging") {
  throw new Error(`Expected active Austria map order, received ${JSON.stringify(firstHotel)}`);
}

const namedPlace = resolveTripReferenceForMessage("איך מגיעים ל-Hohensalzburg Fortress?", tripState);
if (namedPlace.destination?.label !== "Hohensalzburg Fortress" || namedPlace.destination.source !== "named_place") {
  throw new Error(`Expected named active-trip place, received ${JSON.stringify(namedPlace)}`);
}

console.log("Kodi trip-agnostic resolver test passed.");
