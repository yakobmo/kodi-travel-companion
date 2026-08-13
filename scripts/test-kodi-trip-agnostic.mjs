#!/usr/bin/env node

import { resolveTripReferenceForMessage } from "../apps/api/dist/agent/tripReferenceResolver.js";
import { lookupTripContext } from "../apps/api/dist/agent/tripLookup.js";
import { buildKodiContext } from "../apps/api/dist/agent/kodiContext.js";

const tripState = {
  trip: { id: "trip_austria", groupId: "group_alps", name: "Austria", groupName: "Alps family" },
  summary: { name: "Austria", groupName: "Alps family" },
  places: [
    {
      id: "vienna-airport",
      name: "Vienna International Airport",
      type: "transport",
      lat: 48.1103,
      lng: 16.5697,
      sourceIndex: 0,
      tags: ["airport", "arrival"],
      visitState: "planned"
    },
    {
      id: "vienna-hotel",
      name: "Vienna Central Hotel",
      type: "lodging",
      lat: 48.2082,
      lng: 16.3738,
      sourceIndex: 1,
      note: "first lodging 25.8",
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

const scheduledTripState = {
  ...tripState,
  places: [
    tripState.places[0],
    {
      id: "map-first-unscheduled-hotel",
      name: "Imported Map Hotel",
      type: "lodging",
      lat: 48.3,
      lng: 16.4,
      sourceIndex: 0.5,
      tags: [],
      visitState: "planned"
    },
    ...tripState.places.slice(1)
  ]
};
const lookup = lookupTripContext(scheduledTripState, "airport first lodging");
if (
  lookup.itinerary[0]?.lodging.id !== "vienna-hotel" ||
  !lookup.matches.some((place) => place.id === "vienna-airport") ||
  !lookup.matches.some((place) => place.id === "vienna-hotel")
) {
  throw new Error(`Expected generic trip lookup to return arrival and ordered lodging context, received ${JSON.stringify(lookup)}`);
}

const kodiContext = buildKodiContext({
  message: "airport first lodging",
  tripState: scheduledTripState,
  tripLookupResult: lookup
});
if (
  kodiContext.placeDirectory.length !== scheduledTripState.places.length ||
  kodiContext.relevantPlaceDetails.length > 12 ||
  kodiContext.itinerary[0]?.lodging.id !== "vienna-hotel" ||
  "places" in kodiContext ||
  "lodgingTimeline" in kodiContext
) {
  throw new Error(`Expected one compact, non-duplicated Kodi context, received ${JSON.stringify(kodiContext)}`);
}

const legacyDuplicatedContextSize = JSON.stringify({
  tripState: scheduledTripState,
  tripLookupResult: lookup
}).length;
const canonicalContextSize = JSON.stringify(kodiContext).length;
if (canonicalContextSize >= legacyDuplicatedContextSize) {
  throw new Error(
    `Expected canonical context (${canonicalContextSize}) to be smaller than duplicated context (${legacyDuplicatedContextSize})`
  );
}

const datedTripState = {
  ...tripState,
  places: [
    { ...tripState.places[1], id: "night-one", name: "First Stay", note: "לינה לילה ראשון 25.8", sourceIndex: 8 },
    { ...tripState.places[1], id: "nights-two-five", name: "Second Stay", note: "26 אוגוסט ועד 30 לאוגוסט", sourceIndex: 20 },
    { ...tripState.places[1], id: "september-range", name: "September Stay", note: "לינה מה 3-6 בספטמבר", sourceIndex: 2 }
  ]
};
const datedLookup = lookupTripContext(datedTripState, "איפה ישנים בלילה השני?");
if (
  datedLookup.stayCalendar[1]?.lodging.id !== "nights-two-five" ||
  datedLookup.stayCalendar[1]?.date !== "08-26" ||
  datedLookup.itinerary[2]?.lodging.id !== "september-range" ||
  datedLookup.itinerary[2]?.checkIn !== "09-03" ||
  datedLookup.itinerary[2]?.checkOut !== "09-06"
) {
  throw new Error(`Expected a date-expanded stay calendar independent of map order, received ${JSON.stringify(datedLookup)}`);
}

console.log("Kodi trip-agnostic resolver test passed.");
