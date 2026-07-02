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
  const validPlaceIds = new Set(places.map((place) => place.id));
  const sanitizedGroupDestination =
    groupDestination && validPlaceIds.has(groupDestination.placeId) ? groupDestination : null;
  const sanitizedGroupRoute = sanitizeGroupRoute(groupRoute, validPlaceIds);

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
    groupDestination: sanitizedGroupDestination,
    groupRoute: sanitizedGroupRoute,
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

function sanitizeGroupRoute(
  groupRoute: ReturnType<typeof loadDemoGroupRoute>,
  validPlaceIds: Set<string>
): ReturnType<typeof loadDemoGroupRoute> {
  if (!groupRoute) {
    return null;
  }

  const stops = groupRoute.stops.filter((stop) => validPlaceIds.has(stop.placeId));
  if (stops.length < 2) {
    return null;
  }

  const completedStopIds = groupRoute.completedStopIds.filter((placeId) => validPlaceIds.has(placeId));
  const activeStopIndex = Math.min(groupRoute.activeStopIndex, stops.length - 1);

  return {
    ...groupRoute,
    activeStopIndex,
    completedStopIds,
    stops
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
