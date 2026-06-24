import type { TripState } from "../domain/types.js";
import { loadDemoGroupDestination } from "./localGroupDestination.js";
import { loadDemoGroupRoute } from "./localGroupRoute.js";
import { loadDemoTripMembers } from "./localMembers.js";
import { buildTripPlacesSummary, loadDemoTripPlaces } from "./localPlaces.js";

export function buildDemoTripState(): TripState {
  const places = loadDemoTripPlaces();
  const members = loadDemoTripMembers();
  const groupDestination = loadDemoGroupDestination();
  const groupRoute = loadDemoGroupRoute();

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
