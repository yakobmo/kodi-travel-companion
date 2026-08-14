import type { AgentMessageRequest } from "./kodi.js";

export function buildKodiContext(input: AgentMessageRequest) {
  const tripState = input.tripState;
  if (!tripState) return undefined;

  return {
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
      visibleMembers: tripState.members
        .filter((item) => item.consent.state === "enabled" && item.liveLocation)
        .map((item) => ({
          id: item.member.id,
          name: item.member.displayName,
          role: item.member.role,
          ageGroup: item.member.ageGroup,
          location: item.liveLocation
        }))
    },
    memberLocationResult: input.memberLocationResult
  };
}
