import type { AgentMessageRequest } from "./kodi.js";

export function buildKodiContext(input: AgentMessageRequest) {
  const tripState = input.tripState;
  if (!tripState) return undefined;

  return {
    appSurface: {
      managementMenu: {
        kind: "hamburger_menu",
        sections: ["נקודות הטיול", "ניהול סוכנים", "המסמכים של קודי", "מפות הטיול שלי", "חברי הקבוצה"]
      },
      savedTripPoints: {
        label: "נקודות הטיול",
        meaning: "the private Google Maps places saved for this trip",
        retrievalTool: "search_trip_places"
      }
    },
    trip: tripState.trip,
    summary: tripState.summary,
    itinerary: input.tripLookupResult?.itinerary ?? [],
    stayCalendar: input.tripLookupResult?.stayCalendar ?? [],
    placeDirectory: tripState.places.map((place) => ({
      id: place.id,
      name: place.name,
      type: place.type
    })),
    relevantPlaceDetails: input.tripLookupResult?.matches ?? [],
    selectedPlace: input.selectedPlace,
    currentGroupState: {
      destination: tripState.groupDestination,
      route: tripState.groupRoute,
      members: tripState.members.map((item) => ({
          id: item.member.id,
          name: item.member.displayName,
          role: item.member.role,
          ageGroup: item.member.ageGroup,
          locationSharing:
            item.consent.state === "enabled" && item.liveLocation
              ? "available_through_member_locations_tool"
              : "not_shared"
        }))
    },
    memberLocationResult: input.memberLocationResult
  };
}
