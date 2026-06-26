export type MemberRole = "owner" | "admin" | "member" | "viewer";

export type AgeGroup = "child" | "teen" | "adult" | "senior";

export type PlaceType =
  | "lodging"
  | "attraction"
  | "water"
  | "food"
  | "transport"
  | "stop"
  | "unknown";

export type VisitState = "unvisited" | "visited" | "skipped" | "favorite";

export type LocationSharingState = "enabled" | "disabled" | "pending";

export type TripSetupStep =
  | "welcome"
  | "ai_plan"
  | "trip_group"
  | "members"
  | "google_source"
  | "location"
  | "ready";

export type AiPlanMode = "demo" | "limited" | "full";

export type GoogleSourceState = "not_connected" | "demo_link_ready" | "connected" | "needs_refresh";

export type TripEventType =
  | "message_created"
  | "location_updated"
  | "destination_set"
  | "route_created"
  | "route_progressed"
  | "setup_updated"
  | "system";

export interface TripMember {
  id: string;
  tripGroupId: string;
  displayName: string;
  age?: number;
  ageGroup?: AgeGroup;
  role: MemberRole;
  canChatWithAgent: boolean;
  canMarkVisited: boolean;
  canManagePlaces: boolean;
  canManageMembers: boolean;
}

export interface LocationSharingConsent {
  memberId: string;
  tripGroupId: string;
  state: LocationSharingState;
  updatedAt: string;
}

export interface LiveLocation {
  memberId: string;
  tripGroupId: string;
  lat: number;
  lng: number;
  accuracyMeters?: number;
  updatedAt: string;
  source: "gps" | "demo" | "manual";
}

export interface TripMemberLocationView {
  member: TripMember;
  consent: LocationSharingConsent;
  liveLocation: LiveLocation | null;
  displayLabel?: string;
  updatedMinutesAgo?: number;
}

export interface TripPlace {
  id: string;
  tripId: string;
  tripGroupId: string;
  sourceId?: string;
  sourcePlaceId?: string;
  sourceIndex?: number;
  name: string;
  type: PlaceType;
  address?: string;
  lat?: number;
  lng?: number;
  note?: string;
  tags: string[];
  visitState: VisitState;
}

export interface TripPlacesSummary {
  tripId: string;
  tripGroupId: string;
  total: number;
  byType: Record<string, number>;
  lodgingCount: number;
  waterCount: number;
}

export interface TripState {
  trip: {
    id: string;
    groupId: string;
    name: string;
    groupName: string;
  };
  summary: TripPlacesSummary;
  places: TripPlace[];
  members: TripMemberLocationView[];
  groupDestination?: {
    placeId: string;
    placeName: string;
    address?: string;
    lat?: number;
    lng?: number;
    setByMemberId: string;
    setByName: string;
    setAt: string;
  } | null;
  groupRoute?: {
    routeId: string;
    title: string;
    status: "draft" | "approved" | "completed";
    activeStopIndex: number;
    completedStopIds: string[];
    stops: Array<{
      placeId: string;
      placeName: string;
      address?: string;
      lat?: number;
      lng?: number;
      order: number;
    }>;
    createdByMemberId: string;
    createdByName: string;
    createdAt: string;
  } | null;
  agentContext: {
    name: "קודי";
    language: "he";
    canRecommendPlaces: boolean;
    canCreateRoutes: boolean;
    requiresAdminApprovalForOperationalChanges: boolean;
    visibleLiveLocationMemberIds: string[];
  };
}

export interface TripSetupState {
  tripGroupId: string;
  currentStep: TripSetupStep;
  setupCompleted: boolean;
  aiPlanMode: AiPlanMode;
  setupSummary?: {
    tripName: string;
    firstMemberName: string;
    firstMemberAge?: number;
    googleLink: string;
    savedAt: string;
  };
  googleSource: {
    state: GoogleSourceState;
    sourceType: "google_maps_place_list" | "google_oauth" | "manual" | "demo";
    displayName: string;
    importedPlacesCount: number;
    lastCheckedAt?: string;
  };
  readiness: {
    hasOwner: boolean;
    hasMembers: boolean;
    hasGoogleSource: boolean;
    hasLocationConsentExplained: boolean;
    hasAiPlanExplained: boolean;
  };
  steps: Array<{
    id: TripSetupStep;
    title: string;
    status: "done" | "current" | "pending";
    description: string;
  }>;
  kodiWelcomeMessage: string;
}

export interface TripSetupSubmission {
  tripName: string;
  firstMemberName: string;
  firstMemberAge?: number;
  googleLink: string;
  aiPlanConfirmed: boolean;
  locationConsentExplained: boolean;
}

export interface TripEvent {
  id: string;
  tripGroupId: string;
  eventType: TripEventType;
  actorMemberId?: string;
  actorName?: string;
  relatedEntityId?: string;
  summary: string;
  createdAt: string;
}

export interface AgentContextSnapshot {
  tripGroupId: string;
  tripId: string;
  requestingMemberId: string;
  requestingMemberName: string;
  requestingMemberAge?: number;
  requestingMemberAgeGroup?: AgeGroup;
  requestingMemberRole: MemberRole;
  currentLocation?: {
    lat: number;
    lng: number;
  };
  candidatePlaces: TripPlace[];
}
