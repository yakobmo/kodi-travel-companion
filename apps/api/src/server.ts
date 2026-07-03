import express from "express";
import { fileURLToPath } from "node:url";
import { buildHealthPayload } from "./health.js";
import {
  authorizeTripUsageCapability,
  buildDemoTripUsagePool,
  buildTripUsageAuditSummary,
  type TripUsageGateDecision
} from "./billing/tripUsagePool.js";
import { buildTripPlacesSummary, loadDemoTripPlaces } from "./data/localPlaces.js";
import { searchGooglePlacesText, type GooglePlacesTextSearchResult } from "./google/placesSearch.js";
import { estimateGoogleRoute, type GoogleRouteTravelMode } from "./google/routes.js";
import { buildDemoGoogleSourcePreview, getGoogleSourceReadiness } from "./google/sourceAdapter.js";
import {
  addDemoTripMemberAsync,
  loadDemoTripMembersAsync,
  removeDemoTripMemberAsync,
  resetDemoTripMembersAsync,
  updateDemoMemberLocationAsync
} from "./data/localMembers.js";
import {
  appendDemoTripMessageAsync,
  loadDemoTripMessagesAsync,
  resetDemoTripMessagesAsync
} from "./data/localMessages.js";
import {
  buildDemoTripSetupStateAsync,
  resetDemoTripSetupStateAsync,
  saveDemoTripSetupStateAsync
} from "./data/localSetupState.js";
import { getDemoStorageMetadata } from "./data/demoStorage.js";
import { checkSupabaseRuntime } from "./data/supabaseStatus.js";
import {
  applySupabaseEventLogMigration,
  applySupabaseRelationalRouteMigration,
  applySupabaseSetupStateMigration,
  applySupabaseServiceRoleGrants,
  isValidMigrationAdminToken
} from "./data/supabaseMigrationAdmin.js";
import {
  getDemoTripEventLogStatus,
  loadDemoTripEventsAsync,
  recordDemoTripEventAsync,
  resetDemoTripEventsAsync
} from "./data/localEvents.js";
import {
  loadDemoGroupDestinationAsync,
  resetDemoGroupDestinationAsync,
  saveDemoGroupDestinationAsync
} from "./data/localGroupDestination.js";
import {
  loadDemoGroupRouteAsync,
  resetDemoGroupRouteAsync,
  saveDemoGroupRouteAsync
} from "./data/localGroupRoute.js";
import { buildDemoTripState, buildDemoTripStateAsync } from "./data/localTripState.js";
import { createNavigationLinks } from "./navigation/links.js";
import { buildKodiReplyFromContext } from "./agent/kodi.js";
import { tryBuildKodiReplyWithOpenAi } from "./agent/openaiAgent.js";
import { createKodiSpeechAudio } from "./agent/openaiSpeech.js";
import { reverseGeocodeLocation } from "./google/reverseGeocode.js";
import { resolveTripReferenceForMessage } from "./agent/tripContextResolver.js";
import {
  buildTripTimelineFromGoogleMapOrder,
  resolveTimelineReferenceForMessage,
  type TripTimelineResolution
} from "./agent/tripTimelineResolver.js";
import { canMemberRunAgentAction, isAgentActionType } from "./permissions/agentActions.js";
import type { AgeGroup, TripEventType } from "./domain/types.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const webDistDir = process.env.WEB_DIST_DIR ?? fileURLToPath(new URL("../../web/dist", import.meta.url));
const agentTripStateCacheMs = Math.min(Math.max(Number(process.env.AGENT_TRIP_STATE_CACHE_MS ?? 5000), 0), 30000);
let agentTripStateCache:
  | {
      loadedAt: number;
      state: ReturnType<typeof buildDemoTripState>;
    }
  | undefined;

async function buildAgentTripStateSnapshot() {
  const now = Date.now();
  if (agentTripStateCache && agentTripStateCacheMs > 0 && now - agentTripStateCache.loadedAt <= agentTripStateCacheMs) {
    return agentTripStateCache.state;
  }

  const state = await buildDemoTripStateAsync();
  agentTripStateCache = {
    loadedAt: now,
    state
  };

  return state;
}

function isConversationMessage(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { author?: unknown; text?: unknown };
  return typeof candidate.author === "string" && typeof candidate.text === "string";
}

function buildFocusedReferenceMessage(message: string, recentMessages: unknown[]) {
  const trimmed = message.trim();
  const normalized = trimmed.toLowerCase();
  const shouldReset =
    normalized.includes("יצאת מהשיחה") ||
    normalized.includes("לא הבנת") ||
    normalized.includes("אוורוף זה סוף") ||
    normalized.includes("נוחתים באתונה");

  if (shouldReset) {
    return trimmed;
  }

  const needsPreviousQuestion =
    trimmed.length <= 24 ||
    ["מארתה", "מאריתה", "מרתה", "מרתיה", "marathia", "כן", "לא", "אותו", "אותה"].some((term) =>
      normalized.includes(term)
    );

  const isRouteFollowUp = ["גשר", "אונטריו", "אנטיריו", "ריו", "חושך", "לפני החושך", "מסוכנת", "מסוכן", "הרים"].some(
    (term) => normalized.includes(term)
  );

  if (!needsPreviousQuestion && !isRouteFollowUp) {
    return trimmed;
  }

  const previousMemberMessages = recentMessages
    .filter(
      (item): item is { author: string; text: string; source?: string } =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof (item as { text?: unknown }).text === "string" &&
        (item as { source?: unknown }).source !== "agent"
    )
    .slice(-2)
    .map((item) => item.text);

  return [...previousMemberMessages, trimmed].join(" ");
}

function buildAgentContextSummary(input: {
  tripGroupId?: string;
  member: { id?: string; displayName?: string; role?: string };
  recentMessages: unknown[];
  tripState: ReturnType<typeof buildDemoTripState>;
  externalPlacesSearchStatus?: string;
  routeEstimateStatus?: string;
  tripContextConfidence?: string;
  tripContextReason?: string;
  timelineReferenceConfidence?: string;
  timelineReferenceReason?: string;
  timelineSegmentTitle?: string;
  usageGateResults?: TripUsageGateDecision[];
  permissionPolicy?: {
    operationalChangesRequireAdmin?: boolean;
    canShareLiveLocation?: boolean;
  };
}) {
  const visibleLiveLocationMembers = input.tripState.members.filter(
    (item) => item.consent.state === "enabled" && item.liveLocation
  );

  return {
    tripGroupId: input.tripGroupId ?? input.tripState.trip.groupId,
    memberId: input.member.id,
    memberName: input.member.displayName,
    memberRole: input.member.role,
    recentMessagesCount: input.recentMessages.length,
    hasTripState: true,
    visibleLiveLocationMembers: visibleLiveLocationMembers.length,
    externalPlacesSearchStatus: input.externalPlacesSearchStatus,
    routeEstimateStatus: input.routeEstimateStatus,
    tripContextConfidence: input.tripContextConfidence,
    tripContextReason: input.tripContextReason,
    timelineReferenceConfidence: input.timelineReferenceConfidence,
    timelineReferenceReason: input.timelineReferenceReason,
    timelineSegmentTitle: input.timelineSegmentTitle,
    usageGateResults: input.usageGateResults,
    operationalChangesRequireAdmin: input.permissionPolicy?.operationalChangesRequireAdmin ?? true,
    canShareLiveLocation: input.permissionPolicy?.canShareLiveLocation ?? false
  };
}

function includesAnyTerm(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function shouldUseDeterministicRouteDiagram(message: string) {
  const normalizedMessage = message.toLowerCase();

  return (
    includesAnyTerm(normalizedMessage, [
      "תרשים",
      "שרטוט",
      "ציור",
      "סכמה",
      "מפת מסלול",
      "מפה של מסלול",
      "תראה לי מסלול",
      "תראה את המסלול",
      "צייר לי",
      "route map",
      "route diagram",
      "trip sketch"
    ]) &&
    includesAnyTerm(normalizedMessage, ["מסלול", "טיול", "מפה", "יוון", "trip", "route", "map"])
  );
}

function isKodiPresencePing(message: string) {
  const normalized = message.replace(/[?!.,\s]/g, "").toLowerCase();
  return ["קודי", "kodi", "codex", "קודקס"].includes(normalized);
}

function shouldUseExternalPlacesSearch(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (
    includesAnyTerm(normalizedMessage, [
      "near",
      "nearby",
      "find",
      "search",
      "recommend",
      "hotel",
      "beach",
      "food",
      "toilets",
      "pharmacy",
      "fuel",
      "restaurant",
      "accessible",
      "parking",
      "road",
      "weather",
      "sunset",
      "cash",
      "budget",
      "exchange",
      "currency",
      "atm"
    ])
  ) {
    return true;
  }

  if (
    includesAnyTerm(message, [
      "איפה",
      "יש",
      "ליד",
      "קרוב",
      "באזור",
      "בדרך",
      "בא לי",
      "רוצה",
      "צריך",
      "צריכים",
      "מחפש",
      "מחפשים",
      "תמצא",
      "תציע",
      "המלצה",
      "משהו",
      "נגיש",
      "רכב",
      "חניה",
      "כביש",
      "שקיעה",
      "מזג",
      "מזומן",
      "תקציב",
      "צ'יינג",
      "צ׳יינג",
      "המרת כספים",
      "יורו",
      "כספומט"
    ])
  ) {
    return true;
  }

  return includesAnyTerm(message, [
    "גלידה",
    "מסעדה",
    "אוכל",
    "קפה",
    "שירותים",
    "בית מרקחת",
    "פארם",
    "סופר",
    "חנות",
    "קרוב",
    "באזור"
  ]);
}

function shouldUseRouteEstimate(message: string) {
  if (includesAnyTerm(message, ["כמה זמן", "זמן נסיעה", "נסיעה עד", "ETA", "מרחק", "כמה רחוק", "נגיע", "נצא", "לפני השקיעה"])) {
    return true;
  }

  const asksForTimeOrDistance = includesAnyTerm(message, [
    "כמה זמן",
    "זמן נסיעה",
    "נסיעה עד",
    "ETA",
    "מרחק",
    "כמה רחוק",
    "נגיע",
    "נצא",
    "לפני השקיעה"
  ]);
  const hasDestinationHint = includesAnyTerm(message, ["מלון", "בית מלון", "לינה", "יעד", "תחנה", "אטרקציה", "פיליון", "אתונה", "צפון יוון", "זגוריה", "צומרקה"]);

  return asksForTimeOrDistance && hasDestinationHint;
}

function buildExternalPlacesQuery(message: string) {
  const normalizedMessage = message
    .replace(/קודי[, ]*/g, "")
    .replace(/\?/g, "")
    .trim();

  if (shouldReverseGeocodeCurrentLocation(message)) {
    return "school nearby";
  }

  if (
    includesAnyTerm(message.toLowerCase(), [
      "restaurant",
      "taverna",
      "food",
      "dinner",
      "מסעדה",
      "טברנה",
      "טברנות",
      "אוכל",
      "לאכול",
      "ארוחה",
      "קפה"
    ])
  ) {
    return "taverna restaurant near hotel";
  }

  if (normalizedMessage.length >= 3) {
    return `${normalizedMessage} nearby`;
  }

  if (includesAnyTerm(message, ["גלידה", "מתוק", "קינוח"])) {
    return "gelato ice cream nearby";
  }

  if (includesAnyTerm(message, ["שירותים", "WC"])) {
    return "public toilets nearby";
  }

  if (includesAnyTerm(message, ["בית מרקחת", "פארם", "תרופה"])) {
    return "pharmacy nearby";
  }

  if (includesAnyTerm(message, ["מסעדה", "אוכל", "קפה"])) {
    return "family friendly food nearby";
  }

  return message;
}

function shouldUseFastTripAnswer(message: string) {
  if (process.env.KODI_FAST_TRIP_ANSWER_ENABLED !== "true") {
    return false;
  }

  const normalizedMessage = message.toLowerCase();
  const asksLodging = includesAnyTerm(normalizedMessage, [
    "hotel",
    "lodging",
    "tonight",
    "מלון",
    "בית מלון",
    "לינה",
    "לישון",
    "ישנים",
    "הלילה"
  ]);
  const asksFood = includesAnyTerm(normalizedMessage, [
    "restaurant",
    "taverna",
    "food",
    "dinner",
    "מסעדה",
    "טברנה",
    "טברנות",
    "אוכל",
    "לאכול",
    "ארוחה"
  ]);

  return asksLodging && asksFood;
}

function getFastTripLodging(
  tripState: ReturnType<typeof buildDemoTripState>,
  timelineReference: TripTimelineResolution
) {
  if (timelineReference.confidence !== "low" && timelineReference.segment?.lodging) {
    return timelineReference.segment.lodging;
  }

  const activeStop = tripState.groupRoute?.stops[tripState.groupRoute.activeStopIndex];
  if (activeStop) {
    const activeStopPlace = tripState.places.find((place) => place.id === activeStop.placeId);
    if (activeStopPlace?.type === "lodging") {
      return activeStopPlace;
    }
  }

  const destinationPlace = tripState.groupDestination?.placeId
    ? tripState.places.find((place) => place.id === tripState.groupDestination?.placeId)
    : undefined;
  if (destinationPlace?.type === "lodging") {
    return destinationPlace;
  }

  return buildTripTimelineFromGoogleMapOrder(tripState)[0]?.lodging ?? tripState.places.find((place) => place.type === "lodging");
}

function formatFastPlaceLine(place: GooglePlacesTextSearchResult["places"][number]) {
  const title = place.displayName ?? place.formattedAddress ?? "מקום קרוב";
  const address = place.formattedAddress ? `, ${place.formattedAddress}` : "";
  const mapsLink = place.googleMapsUri ? `\nפתיחה בגוגל מפות: ${place.googleMapsUri}` : "";

  return `${title}${address}${mapsLink}`;
}

function distanceMetersBetween(first: { lat: number; lng: number }, second: { lat: number; lng: number }) {
  const earthRadiusMeters = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(second.lat - first.lat);
  const deltaLng = toRadians(second.lng - first.lng);
  const firstLat = toRadians(first.lat);
  const secondLat = toRadians(second.lat);
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findFastNearbyFoodPlace(
  tripState: ReturnType<typeof buildDemoTripState>,
  lodging: { id?: string; lat?: number; lng?: number }
) {
  if (typeof lodging.lat !== "number" || typeof lodging.lng !== "number") {
    return undefined;
  }

  const lodgingLocation = { lat: lodging.lat, lng: lodging.lng };

  return tripState.places
    .filter((place) => place.id !== lodging.id && place.type === "food" && typeof place.lat === "number" && typeof place.lng === "number")
    .map((place) => ({
      place,
      distanceMeters: distanceMetersBetween(lodgingLocation, { lat: Number(place.lat), lng: Number(place.lng) })
    }))
    .filter((item) => item.distanceMeters <= 25000)
    .sort((first, second) => first.distanceMeters - second.distanceMeters)[0];
}

function buildGoogleMapsSearchNearLocation(query: string, location: { lat?: number; lng?: number }) {
  if (typeof location.lat !== "number" || typeof location.lng !== "number") {
    return undefined;
  }

  return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${location.lat},${location.lng},14z`;
}

function buildFastTripAnswer(input: {
  message: string;
  tripState: ReturnType<typeof buildDemoTripState>;
  timelineReference: TripTimelineResolution;
  externalPlacesSearch?: GooglePlacesTextSearchResult;
}) {
  if (!shouldUseFastTripAnswer(input.message)) {
    return undefined;
  }

  const lodging = getFastTripLodging(input.tripState, input.timelineReference);
  if (!lodging) {
    return undefined;
  }

  const nearbySavedFood = findFastNearbyFoodPlace(input.tripState, lodging);
  const nearbyExternalFood = input.externalPlacesSearch?.places.find((place) => place.displayName || place.formattedAddress);
  const lodgingAddress = lodging.address ? `\nכתובת: ${lodging.address}` : "";
  const foodText =
    nearbySavedFood
      ? `\nמהנקודות שכבר שמורות במפת הטיול, מקום אוכל קרוב להתחיל ממנו: ${nearbySavedFood.place.name}${
          nearbySavedFood.place.address ? `, ${nearbySavedFood.place.address}` : ""
        } (${Math.max(1, Math.round(nearbySavedFood.distanceMeters / 1000))} ק״מ מהמלון בערך).`
      : input.externalPlacesSearch?.status === "ready" && nearbyExternalFood
        ? `\nטברנה/מסעדה קרובה להתחיל ממנה: ${formatFastPlaceLine(nearbyExternalFood)}`
        : `\nלא מצאתי כרגע נקודת אוכל שמורה קרובה מספיק במפת הטיול. חיפוש מהיר בגוגל מפות סביב המלון: ${
            buildGoogleMapsSearchNearLocation("taverna restaurant", lodging) ?? "פתח את המלון במפה וחפש טברנה לידו"
          }`;

  return {
    text: `הלינה הלילה לפי ציר הטיול היא ${lodging.name}.${lodgingAddress}${foodText}\nאם תרצה, כתוב "שים בוויז" ואפתח ניווט למלון או למקום שבחרת.`,
    intent: "trip_fast_answer",
    recommendedPlaceId: lodging.id,
    source: "rules" as const
  };
}

function shouldReverseGeocodeCurrentLocation(message: string) {
  return includesAnyTerm(message, [
    "איפה אני",
    "איפה אני עכשיו",
    "איפה אנחנו",
    "מיקום נוכחי",
    "אתה רואה אותי",
    "where am i",
    "current location"
  ]);
}

function shouldUseHereAndNowContext(message: string) {
  return includesAnyTerm(message, [
    "כאן",
    "לידי",
    "לידינו",
    "בסביבה",
    "איפה אני",
    "מיקום עכשווי",
    "כאן ועכשיו",
    "הטיול החי",
    "בבאר שבע",
    "באר שבע",
    "near me",
    "around me",
    "here",
    "current location"
  ]);
}

function getRequestCurrentLocation(context: unknown) {
  if (!context || typeof context !== "object") {
    return undefined;
  }

  const currentLocation = (context as { currentLocation?: { lat?: unknown; lng?: unknown } }).currentLocation;
  if (typeof currentLocation?.lat !== "number" || typeof currentLocation.lng !== "number") {
    return undefined;
  }

  return {
    lat: currentLocation.lat,
    lng: currentLocation.lng
  };
}

function withRequestCurrentLocation(
  tripState: ReturnType<typeof buildDemoTripState>,
  member: { id?: unknown; displayName?: unknown; role?: unknown },
  currentLocation?: { lat: number; lng: number }
) {
  if (!currentLocation) {
    return tripState;
  }

  const memberId =
    typeof member.id === "string" && tripState.members.some((item) => item.member.id === member.id)
      ? member.id
      : tripState.members.find(
          (item) => typeof member.displayName === "string" && item.member.displayName === member.displayName
        )?.member.id ??
        tripState.members.find((item) => item.member.role === "owner")?.member.id ??
        tripState.members[0]?.member.id;

  if (!memberId) {
    return tripState;
  }

  const now = new Date().toISOString();
  const members = tripState.members.map((item) => {
    if (item.member.id !== memberId) {
      return item;
    }

    return {
      ...item,
      consent: {
        ...item.consent,
        state: "enabled" as const,
        updatedAt: now
      },
      liveLocation: {
        memberId: item.member.id,
        tripGroupId: item.member.tripGroupId,
        lat: currentLocation.lat,
        lng: currentLocation.lng,
        updatedAt: now,
        source: "gps" as const
      },
      displayLabel: typeof member.displayName === "string" ? member.displayName : item.displayLabel,
      updatedMinutesAgo: 0
    };
  });

  return {
    ...tripState,
    members,
    agentContext: {
      ...tripState.agentContext,
      visibleLiveLocationMemberIds: Array.from(
        new Set([...tripState.agentContext.visibleLiveLocationMemberIds, memberId])
      )
    }
  };
}

function getSearchLocationFromTripState(
  tripState: ReturnType<typeof buildDemoTripState>,
  timelineReference?: TripTimelineResolution,
  forceLiveLocation = false
) {
  const visibleMembers = tripState.members.filter((item) => item.consent.state === "enabled" && item.liveLocation);
  const visibleMember = forceLiveLocation
    ? [...visibleMembers].sort((first, second) => {
        const firstGpsRank = first.liveLocation?.source === "gps" ? 1 : 0;
        const secondGpsRank = second.liveLocation?.source === "gps" ? 1 : 0;
        if (firstGpsRank !== secondGpsRank) {
          return secondGpsRank - firstGpsRank;
        }

        return (
          new Date(second.liveLocation?.updatedAt ?? 0).getTime() -
          new Date(first.liveLocation?.updatedAt ?? 0).getTime()
        );
      })[0]
    : visibleMembers[0];

  if (forceLiveLocation && visibleMember?.liveLocation) {
    return {
      lat: visibleMember.liveLocation.lat,
      lng: visibleMember.liveLocation.lng
    };
  }

  if (timelineReference && timelineReference.confidence !== "low" && timelineReference.referenceLocation) {
    return {
      lat: timelineReference.referenceLocation.lat,
      lng: timelineReference.referenceLocation.lng
    };
  }

  if (visibleMember?.liveLocation) {
    return {
      lat: visibleMember.liveLocation.lat,
      lng: visibleMember.liveLocation.lng
    };
  }

  const destination = tripState.groupDestination;
  if (destination && typeof destination.lat === "number" && typeof destination.lng === "number") {
    return {
      lat: destination.lat,
      lng: destination.lng
    };
  }

  const firstPlaceWithCoordinates = tripState.places.find(
    (place) => typeof place.lat === "number" && typeof place.lng === "number"
  );

  if (!firstPlaceWithCoordinates) {
    return {};
  }

  return {
    lat: firstPlaceWithCoordinates.lat,
    lng: firstPlaceWithCoordinates.lng
  };
}

function getRouteDestinationFromTripState(tripState: ReturnType<typeof buildDemoTripState>, message: string) {
  const wantsHotel = includesAnyTerm(message, ["מלון", "בית מלון", "לינה"]);

  if (!wantsHotel && tripState.groupDestination?.lat && tripState.groupDestination.lng) {
    return {
      lat: tripState.groupDestination.lat,
      lng: tripState.groupDestination.lng
    };
  }

  const lodging = tripState.places.find(
    (place) => place.type === "lodging" && typeof place.lat === "number" && typeof place.lng === "number"
  );

  if (lodging) {
    return {
      lat: lodging.lat,
      lng: lodging.lng
    };
  }

  if (tripState.groupDestination?.lat && tripState.groupDestination.lng) {
    return {
      lat: tripState.groupDestination.lat,
      lng: tripState.groupDestination.lng
    };
  }

  return undefined;
}

function parseTravelMode(value: unknown): GoogleRouteTravelMode {
  return value === "WALK" || value === "BICYCLE" || value === "TWO_WHEELER" || value === "DRIVE" ? value : "DRIVE";
}

async function safeRecordTripEvent(input: {
  eventType: TripEventType;
  actorMemberId?: string;
  actorName?: string;
  relatedEntityId?: string;
  summary: string;
}) {
  try {
    return await recordDemoTripEventAsync(input);
  } catch (error) {
    console.warn("Trip event recording skipped", error instanceof Error ? error.message : error);
    return null;
  }
}

async function safeRecordUsageGateEvent(input: {
  usageGate: TripUsageGateDecision;
  actorName?: string;
  source: "direct_api" | "kodi_agent";
}) {
  if (!input.usageGate.allowed) {
    return null;
  }

  return safeRecordTripEvent({
    eventType: "system",
    actorMemberId: input.usageGate.audit.triggeringMemberId,
    actorName: input.actorName ?? "Kodi usage gate",
    relatedEntityId: input.usageGate.capability,
    summary:
      `Usage gate authorized ${input.usageGate.capability} via ${input.source}; ` +
      `chargedTo=${input.usageGate.chargedTo}; providerConfigured=${input.usageGate.providerConfigured}.`
  });
}

app.use((req, res, next) => {
  const allowedOrigins = new Set([
    process.env.APP_BASE_URL ?? "http://localhost:5173",
    "http://127.0.0.1:5173"
  ]);
  const origin = req.headers.origin;

  if (typeof origin === "string" && allowedOrigins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json(buildHealthPayload());
});

app.get("/api/config/maps", (_req, res) => {
  const browserKey =
    process.env.GOOGLE_MAPS_BROWSER_API_KEY?.trim() || process.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || "";
  const allowServerKeyInBrowser = process.env.GOOGLE_MAPS_ALLOW_SERVER_KEY_IN_BROWSER === "true";
  const fallbackServerKey = allowServerKeyInBrowser ? process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "" : "";
  const apiKey = browserKey || fallbackServerKey;

  res.json({
    provider: "google_maps",
    configured: apiKey.length > 0,
    apiKey: apiKey || undefined,
    source: browserKey ? "browser_key" : fallbackServerKey ? "explicit_server_key_fallback" : "not_configured",
    warning: browserKey
      ? undefined
      : "Google Maps browser rendering requires GOOGLE_MAPS_BROWSER_API_KEY or VITE_GOOGLE_MAPS_API_KEY. Server-only GOOGLE_MAPS_API_KEY is not exposed unless GOOGLE_MAPS_ALLOW_SERVER_KEY_IN_BROWSER=true."
  });
});

app.get("/api/trips/demo/places", (_req, res) => {
  const places = loadDemoTripPlaces();
  res.json({
    summary: buildTripPlacesSummary(places),
    places
  });
});

app.get("/api/trips/demo/google-source", (_req, res) => {
  res.json(buildDemoGoogleSourcePreview());
});

app.get("/api/trips/demo/google-source/readiness", (_req, res) => {
  res.json(getGoogleSourceReadiness());
});

app.get("/api/trips/demo/timeline", async (_req, res) => {
  const tripState = await buildDemoTripStateAsync();

  res.json({
    tripGroupId: tripState.trip.groupId,
    source: "google_map_order_lodging_segments",
    segments: buildTripTimelineFromGoogleMapOrder(tripState)
  });
});

app.get("/api/google/places/text-search", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";

  if (query.length < 2) {
    res.status(400).json({
      error: "query is required"
    });
    return;
  }

  const lat = typeof req.query.lat === "string" ? Number(req.query.lat) : undefined;
  const lng = typeof req.query.lng === "string" ? Number(req.query.lng) : undefined;
  const radiusMeters = typeof req.query.radiusMeters === "string" ? Number(req.query.radiusMeters) : undefined;

  if ((lat !== undefined && Number.isNaN(lat)) || (lng !== undefined && Number.isNaN(lng))) {
    res.status(400).json({
      error: "lat and lng must be valid numbers when provided"
    });
    return;
  }

  const tripState = await buildDemoTripStateAsync();
  const usagePool = buildDemoTripUsagePool({
    tripGroupId: tripState.trip.groupId,
    members: tripState.members
  });
  const usageGate = authorizeTripUsageCapability({
    usagePool,
    capability: "google_places"
  });

  if (!usageGate.allowed) {
    res.status(429).json({
      status: "usage_blocked",
      message: "Google Places usage is blocked by the trip usage pool.",
      usageGate
    });
    return;
  }
  await safeRecordUsageGateEvent({
    usageGate,
    source: "direct_api"
  });

  res.json({
    ...(await searchGooglePlacesText({
      query,
      lat,
      lng,
      radiusMeters,
      languageCode: typeof req.query.languageCode === "string" ? req.query.languageCode : "he",
      regionCode: typeof req.query.regionCode === "string" ? req.query.regionCode : undefined
    })),
    usageGate
  });
});

app.get("/api/google/routes/estimate", async (req, res) => {
  const originLat = typeof req.query.originLat === "string" ? Number(req.query.originLat) : NaN;
  const originLng = typeof req.query.originLng === "string" ? Number(req.query.originLng) : NaN;
  const destinationLat = typeof req.query.destinationLat === "string" ? Number(req.query.destinationLat) : NaN;
  const destinationLng = typeof req.query.destinationLng === "string" ? Number(req.query.destinationLng) : NaN;

  if ([originLat, originLng, destinationLat, destinationLng].some((value) => Number.isNaN(value))) {
    res.status(400).json({
      error: "originLat, originLng, destinationLat and destinationLng are required numbers"
    });
    return;
  }

  const tripState = await buildDemoTripStateAsync();
  const usagePool = buildDemoTripUsagePool({
    tripGroupId: tripState.trip.groupId,
    members: tripState.members
  });
  const usageGate = authorizeTripUsageCapability({
    usagePool,
    capability: "google_routes"
  });

  if (!usageGate.allowed) {
    res.status(429).json({
      status: "usage_blocked",
      message: "Google Routes usage is blocked by the trip usage pool.",
      usageGate
    });
    return;
  }
  await safeRecordUsageGateEvent({
    usageGate,
    source: "direct_api"
  });

  res.json({
    ...(await estimateGoogleRoute({
      origin: { lat: originLat, lng: originLng },
      destination: { lat: destinationLat, lng: destinationLng },
      travelMode: parseTravelMode(req.query.travelMode),
      languageCode: typeof req.query.languageCode === "string" ? req.query.languageCode : "he"
    })),
    usageGate
  });
});

app.get("/api/trips/demo/members", async (_req, res) => {
  const members = await loadDemoTripMembersAsync();
  res.json({
    tripGroupId: "group_family_greece_demo",
    members
  });
});

app.post("/api/trips/demo/members", async (req, res) => {
  const { displayName, age, ageGroup } = req.body ?? {};

  if (typeof displayName !== "string" || displayName.trim().length < 2) {
    res.status(400).json({ error: "displayName is required" });
    return;
  }

  const safeAgeGroup: AgeGroup = ["child", "teen", "adult", "senior"].includes(String(ageGroup))
    ? (String(ageGroup) as AgeGroup)
    : "adult";
  const numericAge = Number(age);
  const safeAge = Number.isInteger(numericAge) && numericAge >= 0 && numericAge <= 120 ? numericAge : undefined;
  const member = await addDemoTripMemberAsync({
    displayName: displayName.trim(),
    ageGroup: safeAgeGroup,
    age: safeAge,
    role: "member"
  });

  await safeRecordTripEvent({
    eventType: "member_joined",
    actorMemberId: member.member.id,
    actorName: member.member.displayName,
    relatedEntityId: member.member.id,
    summary: `${member.member.displayName} joined the trip group.`
  });

  res.json({
    tripGroupId: "group_family_greece_demo",
    member,
    members: await loadDemoTripMembersAsync()
  });
});

app.delete("/api/trips/demo/members/:memberId", async (req, res) => {
  const { memberId } = req.params;
  const { actorMemberId } = req.body ?? {};

  if (typeof actorMemberId !== "string" || actorMemberId.trim().length < 1) {
    res.status(400).json({ error: "actorMemberId is required" });
    return;
  }

  const result = await removeDemoTripMemberAsync({
    memberId,
    actorMemberId: actorMemberId.trim()
  });

  if (!result.ok) {
    const status = result.error === "not_allowed" ? 403 : result.error === "member_not_found" ? 404 : 400;
    res.status(status).json(result);
    return;
  }

  await safeRecordTripEvent({
    eventType: "member_left",
    actorMemberId: actorMemberId.trim(),
    actorName: actorMemberId.trim(),
    relatedEntityId: memberId,
    summary: `${memberId} left or was removed from the trip group.`
  });

  res.json({
    tripGroupId: "group_family_greece_demo",
    ...result
  });
});

app.get("/api/trips/demo/members/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let closed = false;
  let lastFingerprint = "";

  function writeMemberSnapshot(payload: unknown) {
    res.write(`event: trip-members\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  async function publishIfChanged(force = false) {
    try {
      const members = await loadDemoTripMembersAsync();
      const fingerprint = members
        .map((item) => `${item.member.id}:${item.consent.state}:${item.liveLocation?.updatedAt ?? ""}`)
        .join("|");

      if (force || fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        writeMemberSnapshot({
          tripGroupId: "group_family_greece_demo",
          members
        });
      } else {
        res.write(`: heartbeat\n\n`);
      }
    } catch (error) {
      writeMemberSnapshot({
        tripGroupId: "group_family_greece_demo",
        error: error instanceof Error ? error.message : "member_stream_failed"
      });
    }
  }

  req.on("close", () => {
    closed = true;
  });

  await publishIfChanged(true);
  const intervalId = setInterval(() => {
    if (closed) {
      clearInterval(intervalId);
      return;
    }

    void publishIfChanged();
  }, 3000);
});

app.get("/api/trips/demo/messages", async (_req, res) => {
  res.json({
    tripGroupId: "group_family_greece_demo",
    messages: await loadDemoTripMessagesAsync()
  });
});

app.get("/api/trips/demo/messages/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let closed = false;
  let lastFingerprint = "";

  function writeMessageSnapshot(payload: unknown) {
    res.write(`event: trip-messages\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  async function publishIfChanged(force = false) {
    try {
      const messages = await loadDemoTripMessagesAsync();
      const fingerprint = messages.map((message) => `${message.id ?? ""}:${message.createdAt ?? ""}`).join("|");

      if (force || fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        writeMessageSnapshot({
          tripGroupId: "group_family_greece_demo",
          messages
        });
      } else {
        res.write(`: heartbeat\n\n`);
      }
    } catch (error) {
      writeMessageSnapshot({
        tripGroupId: "group_family_greece_demo",
        error: error instanceof Error ? error.message : "message_stream_failed"
      });
    }
  }

  req.on("close", () => {
    closed = true;
  });

  await publishIfChanged(true);
  const intervalId = setInterval(() => {
    if (closed) {
      clearInterval(intervalId);
      return;
    }

    void publishIfChanged();
  }, 3000);
});

app.get("/api/trips/demo/storage", (_req, res) => {
  res.json({
    tripGroupId: "group_family_greece_demo",
    storage: getDemoStorageMetadata()
  });
});

app.get("/api/trips/demo/usage", async (_req, res) => {
  const tripState = await buildDemoTripStateAsync();
  const events = await loadDemoTripEventsAsync();

  res.json({
    tripGroupId: tripState.trip.groupId,
    usagePool: buildDemoTripUsagePool({
      tripGroupId: tripState.trip.groupId,
      members: tripState.members
    }),
    usageAudit: buildTripUsageAuditSummary(events)
  });
});

app.get("/api/trips/demo/storage/supabase-check", async (_req, res) => {
  res.json({
    tripGroupId: "group_family_greece_demo",
    supabase: await checkSupabaseRuntime()
  });
});

app.post("/api/trips/demo/storage/supabase-bridge/verify", async (_req, res) => {
  res.json({
    tripGroupId: "group_family_greece_demo",
    bridge: {
      configured: false,
      writable: false,
      readable: false,
      retired: true,
      replacement: "relational_supabase_tables",
      note: "The temporary JSON bridge has been retired from the active runtime path."
    }
  });
});

app.post("/api/admin/supabase/apply-grants", async (req, res) => {
  const token = req.headers["x-kodi-admin-token"];
  const normalizedToken = Array.isArray(token) ? token[0] : token;

  if (!isValidMigrationAdminToken(normalizedToken)) {
    res.status(403).json({
      error: "admin_token_required"
    });
    return;
  }

  res.json({
    supabase: await applySupabaseServiceRoleGrants()
  });
});

app.post("/api/admin/supabase/apply-relational-route-migration", async (req, res) => {
  const token = req.headers["x-kodi-admin-token"];
  const normalizedToken = Array.isArray(token) ? token[0] : token;

  if (!isValidMigrationAdminToken(normalizedToken)) {
    res.status(403).json({
      error: "admin_token_required"
    });
    return;
  }

  res.json({
    supabase: await applySupabaseRelationalRouteMigration()
  });
});

app.post("/api/admin/supabase/apply-setup-state-migration", async (req, res) => {
  const token = req.headers["x-kodi-admin-token"];
  const normalizedToken = Array.isArray(token) ? token[0] : token;

  if (!isValidMigrationAdminToken(normalizedToken)) {
    res.status(403).json({
      error: "admin_token_required"
    });
    return;
  }

  res.json({
    supabase: await applySupabaseSetupStateMigration()
  });
});

app.post("/api/admin/supabase/apply-event-log-migration", async (req, res) => {
  const token = req.headers["x-kodi-admin-token"];
  const normalizedToken = Array.isArray(token) ? token[0] : token;

  if (!isValidMigrationAdminToken(normalizedToken)) {
    res.status(403).json({
      error: "admin_token_required"
    });
    return;
  }

  res.json({
    supabase: await applySupabaseEventLogMigration()
  });
});

app.get("/api/trips/demo/events", async (_req, res) => {
  res.json({
    tripGroupId: "group_family_greece_demo",
    eventLog: await getDemoTripEventLogStatus(),
    events: await loadDemoTripEventsAsync()
  });
});

app.get("/api/trips/demo/events/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let closed = false;
  let lastFingerprint = "";

  function writeEvent(payload: unknown) {
    res.write(`event: trip-events\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  async function publishIfChanged(force = false) {
    try {
      const payload = {
        tripGroupId: "group_family_greece_demo",
        eventLog: await getDemoTripEventLogStatus(),
        events: await loadDemoTripEventsAsync()
      };
      const fingerprint = payload.events.map((event) => `${event.id}:${event.createdAt}`).join("|");

      if (force || fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        writeEvent(payload);
      } else {
        res.write(`: heartbeat\n\n`);
      }
    } catch (error) {
      writeEvent({
        tripGroupId: "group_family_greece_demo",
        error: error instanceof Error ? error.message : "event_stream_failed"
      });
    }
  }

  req.on("close", () => {
    closed = true;
  });

  await publishIfChanged(true);
  const intervalId = setInterval(() => {
    if (closed) {
      clearInterval(intervalId);
      return;
    }

    void publishIfChanged();
  }, 3000);
});

app.get("/api/trips/demo/group-destination", async (_req, res) => {
  res.json({
    tripGroupId: "group_family_greece_demo",
    destination: await loadDemoGroupDestinationAsync()
  });
});

app.get("/api/trips/demo/group-destination/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let closed = false;
  let lastFingerprint = "";

  function writeDestinationSnapshot(payload: unknown) {
    res.write(`event: group-destination\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  async function publishIfChanged(force = false) {
    try {
      const destination = await loadDemoGroupDestinationAsync();
      const fingerprint = destination
        ? [destination.placeId, destination.setByMemberId, destination.setAt].join("|")
        : "no-destination";

      if (force || fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        writeDestinationSnapshot({
          tripGroupId: "group_family_greece_demo",
          destination
        });
      } else {
        res.write(`: heartbeat\n\n`);
      }
    } catch (error) {
      writeDestinationSnapshot({
        tripGroupId: "group_family_greece_demo",
        error: error instanceof Error ? error.message : "group_destination_stream_failed"
      });
    }
  }

  req.on("close", () => {
    closed = true;
  });

  await publishIfChanged(true);
  const intervalId = setInterval(() => {
    if (closed) {
      clearInterval(intervalId);
      return;
    }

    void publishIfChanged();
  }, 3000);
});

app.get("/api/trips/demo/group-route", async (_req, res) => {
  res.json({
    tripGroupId: "group_family_greece_demo",
    route: await loadDemoGroupRouteAsync()
  });
});

app.get("/api/trips/demo/group-route/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  let closed = false;
  let lastFingerprint = "";

  function writeRouteSnapshot(payload: unknown) {
    res.write(`event: group-route\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  }

  async function publishIfChanged(force = false) {
    try {
      const route = await loadDemoGroupRouteAsync();
      const fingerprint = route
        ? [
            route.routeId,
            route.status,
            route.activeStopIndex,
            route.completedStopIds.join(","),
            route.stops.map((stop) => `${stop.placeId}:${stop.order}`).join(",")
          ].join("|")
        : "no-route";

      if (force || fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        writeRouteSnapshot({
          tripGroupId: "group_family_greece_demo",
          route
        });
      } else {
        res.write(`: heartbeat\n\n`);
      }
    } catch (error) {
      writeRouteSnapshot({
        tripGroupId: "group_family_greece_demo",
        error: error instanceof Error ? error.message : "group_route_stream_failed"
      });
    }
  }

  req.on("close", () => {
    closed = true;
  });

  await publishIfChanged(true);
  const intervalId = setInterval(() => {
    if (closed) {
      clearInterval(intervalId);
      return;
    }

    void publishIfChanged();
  }, 3000);
});

app.post("/api/trips/demo/group-destination", async (req, res) => {
  const { member, placeId } = req.body ?? {};

  if (!member || typeof member !== "object") {
    res.status(400).json({ error: "member context is required" });
    return;
  }

  const candidateMember = member as { id?: unknown; displayName?: unknown; role?: unknown };
  if (
    typeof candidateMember.id !== "string" ||
    typeof candidateMember.displayName !== "string" ||
    !["owner", "admin", "member", "viewer"].includes(String(candidateMember.role))
  ) {
    res.status(400).json({ error: "member id, displayName and valid role are required" });
    return;
  }

  if (typeof placeId !== "string" || placeId.trim().length < 1) {
    res.status(400).json({ error: "placeId is required" });
    return;
  }

  const decision = canMemberRunAgentAction({
    role: candidateMember.role as "owner" | "admin" | "member" | "viewer",
    actionType: "set_group_destination"
  });

  if (!decision.allowed) {
    res.status(403).json({
      tripGroupId: "group_family_greece_demo",
      allowed: false,
      reason: decision.reason
    });
    return;
  }

  const place = loadDemoTripPlaces().find((item) => item.id === placeId);
  if (!place) {
    res.status(404).json({ error: "place not found" });
    return;
  }

  const destination = await saveDemoGroupDestinationAsync({
    tripGroupId: "group_family_greece_demo",
    placeId: place.id,
    placeName: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    setByMemberId: candidateMember.id,
    setByName: candidateMember.displayName,
    setAt: new Date().toISOString()
  });
  await safeRecordTripEvent({
    eventType: "destination_set",
    actorMemberId: candidateMember.id,
    actorName: candidateMember.displayName,
    relatedEntityId: destination.placeId,
    summary: `${candidateMember.displayName} set ${destination.placeName} as the group destination.`
  });

  res.json({
    tripGroupId: "group_family_greece_demo",
    destination
  });
});

app.post("/api/trips/demo/group-route", async (req, res) => {
  const { member, placeIds, title } = req.body ?? {};

  if (!member || typeof member !== "object") {
    res.status(400).json({ error: "member context is required" });
    return;
  }

  const candidateMember = member as { id?: unknown; displayName?: unknown; role?: unknown };
  if (
    typeof candidateMember.id !== "string" ||
    typeof candidateMember.displayName !== "string" ||
    !["owner", "admin", "member", "viewer"].includes(String(candidateMember.role))
  ) {
    res.status(400).json({ error: "member id, displayName and valid role are required" });
    return;
  }

  if (!Array.isArray(placeIds) || placeIds.length < 2 || placeIds.length > 6) {
    res.status(400).json({ error: "placeIds must include 2 to 6 places" });
    return;
  }

  if (!placeIds.every((placeId) => typeof placeId === "string" && placeId.trim().length > 0)) {
    res.status(400).json({ error: "placeIds must be strings" });
    return;
  }

  const decision = canMemberRunAgentAction({
    role: candidateMember.role as "owner" | "admin" | "member" | "viewer",
    actionType: "create_route"
  });

  if (!decision.allowed) {
    res.status(403).json({
      tripGroupId: "group_family_greece_demo",
      allowed: false,
      reason: decision.reason
    });
    return;
  }

  const places = loadDemoTripPlaces();
  const uniquePlaceIds = Array.from(new Set(placeIds));
  const stops = uniquePlaceIds
    .map((placeId, index) => {
      const place = places.find((item) => item.id === placeId);
      if (!place) {
        return null;
      }

      return {
        placeId: place.id,
        placeName: place.name,
        address: place.address,
        lat: place.lat,
        lng: place.lng,
        order: index + 1
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  if (stops.length < 2) {
    res.status(404).json({ error: "at least two valid places are required" });
    return;
  }

  const route = await saveDemoGroupRouteAsync({
    tripGroupId: "group_family_greece_demo",
    routeId: `route_${Date.now()}`,
    title: typeof title === "string" && title.trim().length > 0 ? title.trim() : "מסלול קבוצתי מוצע",
    stops,
    activeStopIndex: 0,
    completedStopIds: [],
    createdByMemberId: candidateMember.id,
    createdByName: candidateMember.displayName,
    createdAt: new Date().toISOString(),
    status: "approved"
  });
  await safeRecordTripEvent({
    eventType: "route_created",
    actorMemberId: candidateMember.id,
    actorName: candidateMember.displayName,
    relatedEntityId: route.routeId,
    summary: `${candidateMember.displayName} created group route: ${route.title}.`
  });

  res.json({
    tripGroupId: "group_family_greece_demo",
    route
  });
});

app.post("/api/trips/demo/group-route/progress", async (req, res) => {
  const { member } = req.body ?? {};

  if (!member || typeof member !== "object") {
    res.status(400).json({ error: "member context is required" });
    return;
  }

  const candidateMember = member as { id?: unknown; displayName?: unknown; role?: unknown };
  if (
    typeof candidateMember.id !== "string" ||
    typeof candidateMember.displayName !== "string" ||
    !["owner", "admin", "member", "viewer"].includes(String(candidateMember.role))
  ) {
    res.status(400).json({ error: "member id, displayName and valid role are required" });
    return;
  }

  const decision = canMemberRunAgentAction({
    role: candidateMember.role as "owner" | "admin" | "member" | "viewer",
    actionType: "mark_place_visited"
  });

  if (!decision.allowed) {
    res.status(403).json({
      tripGroupId: "group_family_greece_demo",
      allowed: false,
      reason: decision.reason
    });
    return;
  }

  const currentRoute = await loadDemoGroupRouteAsync();
  if (!currentRoute) {
    res.status(404).json({ error: "group route not found" });
    return;
  }

  const activeStop = currentRoute.stops[currentRoute.activeStopIndex];
  if (!activeStop) {
    res.status(400).json({ error: "active route stop not found" });
    return;
  }

  const completedStopIds = Array.from(new Set([...currentRoute.completedStopIds, activeStop.placeId]));
  const routeCompleted = completedStopIds.length >= currentRoute.stops.length;
  const nextActiveStopIndex = routeCompleted
    ? currentRoute.activeStopIndex
    : Math.min(currentRoute.activeStopIndex + 1, currentRoute.stops.length - 1);
  const route = await saveDemoGroupRouteAsync({
    ...currentRoute,
    completedStopIds,
    activeStopIndex: nextActiveStopIndex,
    status: routeCompleted ? "completed" : currentRoute.status
  });
  await safeRecordTripEvent({
    eventType: "route_progressed",
    actorMemberId: candidateMember.id,
    actorName: candidateMember.displayName,
    relatedEntityId: route.routeId,
    summary: `${candidateMember.displayName} completed route stop: ${activeStop.placeName}.`
  });

  res.json({
    tripGroupId: "group_family_greece_demo",
    completedStop: activeStop,
    routeCompleted,
    route
  });
});

app.post("/api/trips/demo/messages", async (req, res) => {
  const { author, text, memberId, source } = req.body ?? {};

  if (typeof author !== "string" || author.trim().length < 1) {
    res.status(400).json({ error: "author is required" });
    return;
  }

  if (typeof text !== "string" || text.trim().length < 1) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  if (memberId !== undefined && typeof memberId !== "string") {
    res.status(400).json({ error: "memberId must be a string when provided" });
    return;
  }

  if (source !== undefined && !["member", "agent", "system"].includes(source)) {
    res.status(400).json({ error: "source must be member, agent or system" });
    return;
  }

  const message = await appendDemoTripMessageAsync({
    author: author.trim(),
    text: text.trim(),
    memberId,
    source
  });
  await safeRecordTripEvent({
    eventType: "message_created",
    actorMemberId: memberId,
    actorName: author.trim(),
    relatedEntityId: message.id,
    summary: `${author.trim()} sent a ${message.source} message.`
  });

  res.json({
    tripGroupId: "group_family_greece_demo",
    message
  });
});

app.post("/api/trips/demo/members/:memberId/location", async (req, res) => {
  const { memberId } = req.params;
  const { lat, lng, accuracyMeters } = req.body ?? {};

  if (typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "lat and lng are required numbers" });
    return;
  }

  if (accuracyMeters !== undefined && typeof accuracyMeters !== "number") {
    res.status(400).json({ error: "accuracyMeters must be a number when provided" });
    return;
  }

  const result = await updateDemoMemberLocationAsync({ memberId, lat, lng, accuracyMeters });

  if (!result.ok) {
    res.status(result.error === "member_not_found" ? 404 : 403).json({ error: result.error });
    return;
  }
  await safeRecordTripEvent({
    eventType: "location_updated",
    actorMemberId: memberId,
    actorName: result.member.member.displayName,
    relatedEntityId: memberId,
    summary: `${result.member.member.displayName} updated live location.`
  });

  res.json({
    tripGroupId: "group_family_greece_demo",
    member: result.member
  });
});

app.get("/api/trips/demo/state", async (_req, res) => {
  res.json(await buildDemoTripStateAsync());
});

app.get("/api/trips/demo/setup", async (_req, res) => {
  res.json(await buildDemoTripSetupStateAsync());
});

app.post("/api/trips/demo/setup", async (req, res) => {
  const { tripName, firstMemberName, firstMemberAge, googleLink, aiPlanConfirmed, locationConsentExplained } =
    req.body ?? {};

  if (typeof tripName !== "string" || tripName.trim().length < 2) {
    res.status(400).json({ error: "tripName is required" });
    return;
  }

  if (typeof firstMemberName !== "string" || firstMemberName.trim().length < 2) {
    res.status(400).json({ error: "firstMemberName is required" });
    return;
  }

  if (typeof firstMemberAge !== "number" || firstMemberAge < 0 || firstMemberAge > 120) {
    res.status(400).json({ error: "firstMemberAge must be a number between 0 and 120" });
    return;
  }

  if (typeof googleLink !== "string" || googleLink.trim().length < 10) {
    res.status(400).json({ error: "googleLink is required" });
    return;
  }

  if (typeof aiPlanConfirmed !== "boolean" || typeof locationConsentExplained !== "boolean") {
    res.status(400).json({ error: "setup confirmations are required" });
    return;
  }

  const setupState = await saveDemoTripSetupStateAsync({
    tripName: tripName.trim(),
    firstMemberName: firstMemberName.trim(),
    firstMemberAge,
    googleLink: googleLink.trim(),
    aiPlanConfirmed,
    locationConsentExplained
  });
  await safeRecordTripEvent({
    eventType: "setup_updated",
    actorName: firstMemberName.trim(),
    summary: `Trip setup saved for ${tripName.trim()}.`
  });
  res.json(setupState);
});

app.delete("/api/trips/demo/setup", async (_req, res) => {
  await resetDemoTripMembersAsync();
  await resetDemoTripMessagesAsync();
  await resetDemoGroupDestinationAsync();
  await resetDemoGroupRouteAsync();
  await resetDemoTripEventsAsync();
  res.json(await resetDemoTripSetupStateAsync());
});

app.post("/api/navigation/links", (req, res) => {
  const { lat, lng, label } = req.body ?? {};

  if (typeof lat !== "number" || typeof lng !== "number") {
    res.status(400).json({ error: "lat and lng are required numbers" });
    return;
  }

  res.json(createNavigationLinks({ lat, lng, label }));
});

app.post("/api/trips/demo/agent-actions/authorize", (req, res) => {
  const { member, actionType } = req.body ?? {};

  if (!member || typeof member !== "object") {
    res.status(400).json({ error: "member context is required" });
    return;
  }

  const candidateMember = member as { id?: unknown; displayName?: unknown; role?: unknown };
  if (
    typeof candidateMember.id !== "string" ||
    typeof candidateMember.displayName !== "string" ||
    !["owner", "admin", "member", "viewer"].includes(String(candidateMember.role))
  ) {
    res.status(400).json({ error: "member id, displayName and valid role are required" });
    return;
  }

  if (!isAgentActionType(actionType)) {
    res.status(400).json({ error: "valid actionType is required" });
    return;
  }

  const decision = canMemberRunAgentAction({
    role: candidateMember.role as "owner" | "admin" | "member" | "viewer",
    actionType
  });
  const payload = {
    tripGroupId: "group_family_greece_demo",
    actionType,
    actor: {
      id: candidateMember.id,
      displayName: candidateMember.displayName,
      role: candidateMember.role
    },
    ...decision
  };

  if (!decision.allowed) {
    res.status(403).json(payload);
    return;
  }

  res.json(payload);
});

app.post("/api/agent/message", async (req, res) => {
  const agentStartedAt = Date.now();
  const { message, member, recentMessages, context, tripGroupId } = req.body ?? {};

  if (typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  if (!member || typeof member !== "object") {
    res.status(400).json({ error: "member context is required" });
    return;
  }

  const normalizedMember = member as { id?: unknown; displayName?: unknown; role?: unknown };
  if (
    typeof normalizedMember.id !== "string" ||
    typeof normalizedMember.displayName !== "string" ||
    typeof normalizedMember.role !== "string"
  ) {
    res.status(400).json({ error: "member id, displayName and role are required" });
    return;
  }

  if (!Array.isArray(recentMessages) || !recentMessages.every(isConversationMessage)) {
    res.status(400).json({ error: "recentMessages must be an array of conversation messages" });
    return;
  }

  const requestCurrentLocation = getRequestCurrentLocation(context);
  const hereAndNowContext = shouldUseHereAndNowContext(message);
  const tripState = withRequestCurrentLocation(
    req.body?.tripState ?? (await buildAgentTripStateSnapshot()),
    normalizedMember,
    requestCurrentLocation
  );
  const usagePool = buildDemoTripUsagePool({
    tripGroupId: tripState.trip.groupId,
    members: tripState.members
  });
  const permissionPolicy =
    context && typeof context === "object"
      ? (context as { permissionPolicy?: { operationalChangesRequireAdmin?: boolean; canShareLiveLocation?: boolean } })
          .permissionPolicy
      : undefined;

  if (isKodiPresencePing(message)) {
    res.json({
      author: "קודי",
      text: "אני כאן. תגידו לי מה צריך עכשיו: ניווט, נקודה במסלול, מקום קרוב, הסבר על מה שרואים, או סידור מחדש של המסלול.",
      intent: "general",
      requiresAdminApproval: false,
      source: "fast_presence",
      agentRuntime: {
        openAiStatus: "skipped_presence_ping",
        openAiModel: undefined,
        fallbackUsed: false,
        fastLane: true,
        latencyMs: Date.now() - agentStartedAt
      },
      contextSummary: buildAgentContextSummary({
        tripGroupId,
        member: {
          id: normalizedMember.id,
          displayName: normalizedMember.displayName,
          role: normalizedMember.role
        },
        recentMessages,
        tripState,
        permissionPolicy
      })
    });
    return;
  }

  const focusedReferenceMessage = buildFocusedReferenceMessage(message, recentMessages);
  const timelineReference = resolveTimelineReferenceForMessage(focusedReferenceMessage, tripState);
  const fastTripAnswer = buildFastTripAnswer({
    message: focusedReferenceMessage,
    tripState,
    timelineReference
  });
  if (fastTripAnswer) {
    res.json({
      ...fastTripAnswer,
      agentRuntime: {
        openAiStatus: "skipped_fast_lane",
        openAiModel: undefined,
        fallbackUsed: false,
        fastLane: true,
        latencyMs: Date.now() - agentStartedAt
      },
      contextSummary: buildAgentContextSummary({
        tripGroupId,
        member: {
          id: normalizedMember.id,
          displayName: normalizedMember.displayName,
          role: normalizedMember.role
        },
        recentMessages,
        tripState,
        timelineReferenceConfidence: hereAndNowContext ? "live_location" : timelineReference.confidence,
        timelineReferenceReason: hereAndNowContext
          ? "Here-and-now request: live/current location takes precedence over planned trip timeline."
          : timelineReference.reason,
        timelineSegmentTitle: hereAndNowContext ? undefined : timelineReference.segment?.title,
        permissionPolicy
      })
    });
    return;
  }
  const placesUsageGate = shouldUseExternalPlacesSearch(focusedReferenceMessage)
    ? authorizeTripUsageCapability({
        usagePool,
        capability: "google_places",
        triggeringMember: {
          id: normalizedMember.id,
          role: normalizedMember.role
        }
      })
    : undefined;
  const externalPlacesSearch = placesUsageGate?.allowed
    ? await searchGooglePlacesText({
        query: buildExternalPlacesQuery(focusedReferenceMessage),
        ...getSearchLocationFromTripState(tripState, timelineReference, hereAndNowContext),
        radiusMeters: 3000,
        languageCode: "he"
      })
    : undefined;
  if (placesUsageGate?.allowed) {
    await safeRecordUsageGateEvent({
      usageGate: placesUsageGate,
      actorName: String(normalizedMember.displayName),
      source: "kodi_agent"
    });
  }
  const reverseGeocodedLocation =
    requestCurrentLocation && shouldReverseGeocodeCurrentLocation(message)
      ? await reverseGeocodeLocation({
          lat: requestCurrentLocation.lat,
          lng: requestCurrentLocation.lng,
          languageCode: "he",
          regionCode: "il"
        })
      : undefined;
  const tripReference = resolveTripReferenceForMessage(focusedReferenceMessage, tripState);
  const canEstimateRoute =
    shouldUseRouteEstimate(focusedReferenceMessage) &&
    tripReference.confidence !== "low" &&
    tripReference.origin &&
    tripReference.destination;
  let routeEstimate;
  const routesUsageGate = canEstimateRoute
    ? authorizeTripUsageCapability({
        usagePool,
        capability: "google_routes",
        triggeringMember: {
          id: normalizedMember.id,
          role: normalizedMember.role
        }
      })
    : undefined;
  if (canEstimateRoute && routesUsageGate?.allowed) {
    routeEstimate = await estimateGoogleRoute({
      origin: { lat: Number(tripReference.origin?.lat), lng: Number(tripReference.origin?.lng) },
      destination: { lat: Number(tripReference.destination?.lat), lng: Number(tripReference.destination?.lng) },
      travelMode: includesAnyTerm(focusedReferenceMessage, ["הליכה", "ברגל"]) ? "WALK" : "DRIVE",
      languageCode: "he"
    });
    await safeRecordUsageGateEvent({
      usageGate: routesUsageGate,
      actorName: String(normalizedMember.displayName),
      source: "kodi_agent"
    });
  }
  const rulesReply = buildKodiReplyFromContext({
    ...req.body,
    message: focusedReferenceMessage,
    tripState,
    externalPlacesSearch,
    reverseGeocodedLocation,
    routeEstimate,
    tripContextClarification: shouldUseRouteEstimate(focusedReferenceMessage) ? tripReference.clarificationQuestion : undefined
  });
  const openAiUsageGate = authorizeTripUsageCapability({
    usagePool,
    capability: "openai_agent",
    triggeringMember: {
      id: normalizedMember.id,
      role: normalizedMember.role
    }
  });
  const deterministicRouteDiagram = shouldUseDeterministicRouteDiagram(focusedReferenceMessage);
  const openAiReply =
    openAiUsageGate.allowed && openAiUsageGate.providerConfigured && !deterministicRouteDiagram
      ? await tryBuildKodiReplyWithOpenAi({
          ...req.body,
          message: focusedReferenceMessage,
          tripState,
          externalPlacesSearch,
          reverseGeocodedLocation,
          routeEstimate,
          tripContextClarification: shouldUseRouteEstimate(focusedReferenceMessage) ? tripReference.clarificationQuestion : undefined,
          permissionPolicy,
          rulesReply
        })
      : undefined;
  if (openAiUsageGate.allowed && openAiUsageGate.providerConfigured && !deterministicRouteDiagram && openAiReply?.status === "ready") {
    await safeRecordUsageGateEvent({
      usageGate: openAiUsageGate,
      actorName: String(normalizedMember.displayName),
      source: "kodi_agent"
    });
  }
  const reply = openAiReply?.reply ?? rulesReply;

  res.json({
    ...reply,
    agentRuntime: {
      openAiStatus: openAiReply?.status ?? (openAiUsageGate.providerConfigured ? "skipped" : "not_configured"),
      openAiModel: openAiReply?.model,
      fallbackUsed: reply.source === "rules",
      fastLane: false,
      latencyMs: Date.now() - agentStartedAt
    },
    contextSummary: buildAgentContextSummary({
      tripGroupId,
      member: {
        id: normalizedMember.id,
        displayName: normalizedMember.displayName,
        role: normalizedMember.role
      },
      recentMessages,
      tripState,
      externalPlacesSearchStatus: externalPlacesSearch?.status,
      routeEstimateStatus: routeEstimate?.status,
      tripContextConfidence: shouldUseRouteEstimate(focusedReferenceMessage) ? tripReference.confidence : undefined,
      tripContextReason: shouldUseRouteEstimate(focusedReferenceMessage) ? tripReference.reason : undefined,
      timelineReferenceConfidence: hereAndNowContext ? "live_location" : timelineReference.confidence,
      timelineReferenceReason: hereAndNowContext
        ? "Here-and-now request: live/current location takes precedence over planned trip timeline."
        : timelineReference.reason,
      timelineSegmentTitle: hereAndNowContext ? undefined : timelineReference.segment?.title,
      usageGateResults: [placesUsageGate, routesUsageGate, openAiUsageGate].filter(
        (item): item is TripUsageGateDecision => Boolean(item)
      ),
      permissionPolicy
    })
  });
});

app.post("/api/agent/speech", async (req, res) => {
  const { text } = req.body ?? {};

  if (typeof text !== "string" || text.trim().length === 0) {
    res.status(400).json({ error: "text is required" });
    return;
  }

  const usagePool = buildDemoTripUsagePool({
    tripGroupId: "group_family_greece_demo",
    members: await loadDemoTripMembersAsync()
  });
  const speechUsageGate = authorizeTripUsageCapability({
    usagePool,
    capability: "openai_agent",
    triggeringMember: {
      id: typeof req.body?.memberId === "string" ? req.body.memberId : "manager",
      role: typeof req.body?.memberRole === "string" ? req.body.memberRole : "owner"
    }
  });

  if (!speechUsageGate.allowed) {
    res.status(403).json({
      error: "speech usage is not allowed",
      usageGate: speechUsageGate
    });
    return;
  }

  if (!speechUsageGate.providerConfigured) {
    res.status(503).json({
      error: "openai speech is not configured",
      usageGate: speechUsageGate
    });
    return;
  }

  const speech = await createKodiSpeechAudio(text);

  if (speech.status !== "ready" || !speech.audio) {
    res.status(502).json({
      error: "openai speech failed",
      speechRuntime: {
        status: speech.status,
        model: speech.model,
        voice: speech.voice
      }
    });
    return;
  }

  await safeRecordUsageGateEvent({
    usageGate: speechUsageGate,
    actorName: typeof req.body?.memberName === "string" ? req.body.memberName : "Kodi voice",
    source: "kodi_agent"
  });

  res.setHeader("Content-Type", speech.contentType ?? "audio/mpeg");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Kodi-Voice-Model", speech.model ?? "");
  res.setHeader("X-Kodi-Voice", speech.voice ?? "");
  res.setHeader("X-Kodi-Voice-Speed", String(speech.speed ?? ""));
  res.send(speech.audio);
});

app.use(express.static(webDistDir));

app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api/")) {
    next();
    return;
  }

  res.sendFile("index.html", { root: webDistDir });
});

app.listen(port, () => {
  console.log(`AI Travel Companion API listening on port ${port}`);
});
