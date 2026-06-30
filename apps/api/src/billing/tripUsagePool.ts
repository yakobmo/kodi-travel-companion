import type {
  TripEvent,
  TripMemberLocationView,
  TripUsageAuditSummary,
  TripUsageCapability,
  TripUsagePool
} from "../domain/types.js";

export interface TripUsageGateDecision {
  capability: TripUsageCapability;
  allowed: boolean;
  reason: "usage_pool_authorized" | "usage_pool_blocked" | "capability_unknown";
  chargedTo: "trip_usage_pool";
  quotaEnforcedServerSide: boolean;
  providerConfigured: boolean;
  audit: {
    tripGroupId: string;
    ownerMemberId: string;
    triggeringMemberId?: string;
    triggeringMemberRole?: string;
  };
}

const providerByCapability: Record<TripUsageCapability, "openai" | "google" | "internal"> = {
  openai_agent: "openai",
  google_places: "google",
  google_routes: "google",
  google_oauth_sync: "google"
};

const enabledByCapability: Record<TripUsageCapability, boolean> = {
  openai_agent: Boolean(process.env.OPENAI_API_KEY),
  google_places: Boolean(process.env.GOOGLE_MAPS_API_KEY),
  google_routes: Boolean(process.env.GOOGLE_MAPS_API_KEY),
  google_oauth_sync: false
};

const capabilities: TripUsageCapability[] = ["openai_agent", "google_places", "google_routes", "google_oauth_sync"];
const capabilitySet = new Set<TripUsageCapability>(capabilities);

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
    status: process.env.OPENAI_API_KEY ? "active" : "not_configured",
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

export function authorizeTripUsageCapability(input: {
  usagePool: TripUsagePool;
  capability: TripUsageCapability;
  triggeringMember?: {
    id?: string;
    role?: string;
  };
}): TripUsageGateDecision {
  const capability = input.usagePool.capabilities.find((item) => item.capability === input.capability);

  if (!capability) {
    return {
      capability: input.capability,
      allowed: false,
      reason: "capability_unknown",
      chargedTo: "trip_usage_pool",
      quotaEnforcedServerSide: true,
      providerConfigured: false,
      audit: {
        tripGroupId: input.usagePool.tripGroupId,
        ownerMemberId: input.usagePool.ownerMemberId,
        triggeringMemberId: input.triggeringMember?.id,
        triggeringMemberRole: input.triggeringMember?.role
      }
    };
  }

  const allowed = input.usagePool.status !== "blocked" && input.usagePool.policy.costlyCallsRequireBackendGate;

  return {
    capability: input.capability,
    allowed,
    reason: allowed ? "usage_pool_authorized" : "usage_pool_blocked",
    chargedTo: "trip_usage_pool",
    quotaEnforcedServerSide: capability.quotaEnforcedServerSide,
    providerConfigured: capability.enabled,
    audit: {
      tripGroupId: input.usagePool.tripGroupId,
      ownerMemberId: input.usagePool.ownerMemberId,
      triggeringMemberId: input.triggeringMember?.id,
      triggeringMemberRole: input.triggeringMember?.role
    }
  };
}

function isTripUsageCapability(value: unknown): value is TripUsageCapability {
  return typeof value === "string" && capabilitySet.has(value as TripUsageCapability);
}

function getUsageAuditSource(summary: string): "direct_api" | "kodi_agent" | "unknown" {
  if (summary.includes("via direct_api")) {
    return "direct_api";
  }

  if (summary.includes("via kodi_agent")) {
    return "kodi_agent";
  }

  return "unknown";
}

function getProviderConfigured(summary: string) {
  return summary.includes("providerConfigured=true");
}

export function buildTripUsageAuditSummary(events: TripEvent[]): TripUsageAuditSummary {
  const authorizationEvents = events
    .filter(
      (event) =>
        event.eventType === "system" &&
        event.summary.includes("Usage gate authorized") &&
        isTripUsageCapability(event.relatedEntityId)
    )
    .map((event) => ({
      event,
      capability: event.relatedEntityId as TripUsageCapability,
      source: getUsageAuditSource(event.summary)
    }));

  const byCapability = capabilities
    .map((capability) => ({
      capability,
      count: authorizationEvents.filter((item) => item.capability === capability).length
    }))
    .filter((item) => item.count > 0);

  const sources: Array<"direct_api" | "kodi_agent" | "unknown"> = ["direct_api", "kodi_agent", "unknown"];
  const bySource = sources
    .map((source) => ({
      source,
      count: authorizationEvents.filter((item) => item.source === source).length
    }))
    .filter((item) => item.count > 0);

  return {
    totalAuthorizedCalls: authorizationEvents.length,
    byCapability,
    bySource,
    recentAuthorizations: authorizationEvents.slice(0, 8).map(({ event, capability, source }) => ({
      id: event.id,
      capability,
      source,
      actorName: event.actorName,
      chargedTo: "trip_usage_pool",
      providerConfigured: getProviderConfigured(event.summary),
      createdAt: event.createdAt
    }))
  };
}
