import type { TripState } from "../domain/types.js";
import { loadDemoGroupDestination, loadDemoGroupDestinationAsync } from "./localGroupDestination.js";
import { loadDemoGroupRoute, loadDemoGroupRouteAsync } from "./localGroupRoute.js";
import { loadDemoTripMembers, loadDemoTripMembersAsync } from "./localMembers.js";
import { buildTripPlacesSummary, loadDemoTripPlaces } from "./localPlaces.js";

export function buildDemoTripState(): TripState {
  const places = loadDemoTripPlaces();
  const members = loadDemoTripMembers();
  const groupDestination = loadDemoGroupDestination();
  const groupRoute = loadDemoGroupRoute();

  return buildDemoTripStateFromParts({ places, members, groupDestination, groupRoute });
}

function buildDemoTripStateFromParts(input: {
  places: ReturnType<typeof loadDemoTripPlaces>;
  members: ReturnType<typeof loadDemoTripMembers>;
  groupDestination: ReturnType<typeof loadDemoGroupDestination>;
  groupRoute: ReturnType<typeof loadDemoGroupRoute>;
}): TripState {
  const { places, members, groupDestination, groupRoute } = input;

  return {
    trip: {
      id: "trip_north_greece_demo",
      groupId: "group_family_greece_demo",
      name: "צפון יוון",
      groupName: "משפחת כהן"
    },
    summary: buildTripPlacesSummary(places),
    places,
    members,
    groupDestination,
    groupRoute,
    agentContext: {
      name: "קודי",
      language: "he",
      canRecommendPlaces: true,
      canCreateRoutes: true,
      requiresAdminApprovalForOperationalChanges: true,
      visibleLiveLocationMemberIds: members
        .filter((member) => member.consent.state === "enabled" && member.liveLocation)
        .map((member) => member.member.id)
    }
  };
}

export async function buildDemoTripStateAsync(): Promise<TripState> {
  const places = loadDemoTripPlaces();
  const [members, groupDestination, groupRoute] = await Promise.all([
    loadDemoTripMembersAsync(),
    loadDemoGroupDestinationAsync(),
    loadDemoGroupRouteAsync()
  ]);

  return buildDemoTripStateFromParts({ places, members, groupDestination, groupRoute });
}
