import type { TripMemberLocationView, TripUsageCapability, TripUsagePool } from "../domain/types.js";

const providerByCapability: Record<TripUsageCapability, "openai" | "google" | "internal"> = {
  openai_agent: "openai",
  google_places: "google",
  google_routes: "google",
  google_oauth_sync: "google"
};

const enabledByCapability: Record<TripUsageCapability, boolean> = {
  openai_agent: false,
  google_places: Boolean(process.env.GOOGLE_MAPS_API_KEY),
  google_routes: Boolean(process.env.GOOGLE_MAPS_API_KEY),
  google_oauth_sync: false
};

const capabilities: TripUsageCapability[] = ["openai_agent", "google_places", "google_routes", "google_oauth_sync"];

function findOwner(members: TripMemberLocationView[]) {
  return members.find((item) => item.member.role === "owner") ?? members.find((item) => item.member.role === "admin");
}

export function buildDemoTripUsagePool(input: {
  tripGroupId: string;
  members: TripMemberLocationView[];
}): TripUsagePool {
  const owner = findOwner(input.members);

  return {
    tripGroupId: input.tripGroupId,
    ownerMemberId: owner?.member.id ?? "unknown_owner",
    ownerDisplayName: owner?.member.displayName ?? "Trip owner",
    status: process.env.OPENAI_API_KEY ? "active" : "demo",
    billingModel: "owner_managed",
    participantBillingRequired: false,
    backendMediated: true,
    secretBoundary: {
      providerSecretsStoredServerSide: true,
      exposesProviderSecretsToMembers: false,
      browserReceivesPrivateKeys: false
    },
    capabilities: capabilities.map((capability) => ({
      capability,
      enabled: enabledByCapability[capability],
      provider: providerByCapability[capability],
      chargedTo: "trip_usage_pool",
      triggeredByMemberAuditRequired: true,
      quotaEnforcedServerSide: true
    })),
    policy: {
      membersCanAskKodi: true,
      operationalActionsRequireAdmin: true,
      costlyCallsRequireBackendGate: true,
      usageVisibleToOwner: true
    }
  };
}
