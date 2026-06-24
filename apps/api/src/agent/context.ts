import type { AgentContextSnapshot, TripMember, TripPlace } from "../domain/types.js";

export function buildAgentContext(input: {
  tripGroupId: string;
  tripId: string;
  member: TripMember;
  currentLocation?: { lat: number; lng: number };
  candidatePlaces: TripPlace[];
}): AgentContextSnapshot {
  return {
    tripGroupId: input.tripGroupId,
    tripId: input.tripId,
    requestingMemberId: input.member.id,
    requestingMemberName: input.member.displayName,
    requestingMemberAge: input.member.age,
    requestingMemberAgeGroup: input.member.ageGroup,
    requestingMemberRole: input.member.role,
    currentLocation: input.currentLocation,
    candidatePlaces: input.candidatePlaces
  };
}
