import type { AgeGroup, MemberRole, TripPlace, TripState } from "../domain/types.js";
import type { GooglePlacesTextSearchResult } from "../google/placesSearch.js";
import type { GoogleReverseGeocodeResult } from "../google/reverseGeocode.js";
import type { GoogleRouteEstimateResult } from "../google/routes.js";
import type { TripLookupResult } from "./tripLookup.js";

/** Shared transport types for Kodi's single agent loop. This module deliberately
 * contains no conversational rules or canned replies. */
export interface ConversationMessage {
  author: string;
  text: string;
  memberId?: string;
  source?: "member" | "agent" | "system";
}

export interface AgentMessageRequest {
  member?: {
    id?: string;
    displayName?: string;
    age?: number;
    ageGroup?: AgeGroup;
    role?: MemberRole;
  };
  message: string;
  recentMessages?: ConversationMessage[];
  selectedPlace?: Pick<TripPlace, "id" | "name" | "type" | "address" | "lat" | "lng" | "note" | "tags">;
  tripState?: TripState;
  externalPlacesSearch?: GooglePlacesTextSearchResult;
  reverseGeocodedLocation?: GoogleReverseGeocodeResult;
  routeEstimate?: GoogleRouteEstimateResult;
  tripLookupResult?: TripLookupResult;
  tripContextClarification?: string;
  memberLocationResult?: {
    scope: "all" | "member";
    requestedName?: string;
    authorized: boolean;
    members: Array<{
      name: string;
      role: MemberRole;
      sharing: "available" | "not_shared";
      updatedAt?: string;
      accuracyMeters?: number;
      mapsUrl?: string;
    }>;
  };
  conversationFocus?: {
    effectiveMessage: string;
    locationAnchor?: string;
    continuationContext?: string;
    ellipticalContinuation: boolean;
    correctionDetected: boolean;
    invalidatedAgentClaims: boolean;
  };
}

export interface AgentMessageResponse {
  author: "קודי";
  text: string;
  intent: "local_guide" | "route_creation" | "family_compromise" | "group_location" | "place_recommendation" | "general";
  requiresAdminApproval: boolean;
  source: "rules" | "ai_provider" | "agent_unavailable";
  recommendedPlaceId?: string;
  metadata?: Record<string, unknown>;
}
