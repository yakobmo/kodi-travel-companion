import express from "express";
import webpush from "web-push";
import { fileURLToPath } from "node:url";
import { buildHealthPayload } from "./health.js";
import {
  authorizeTripUsageCapability,
  buildDemoTripUsagePool,
  buildTripUsageAuditSummary,
  type TripUsageGateDecision
} from "./billing/tripUsagePool.js";
import {
  buildTripPlacesSummary,
  DEMO_GOOGLE_SOURCE_URL,
  loadDemoTripPlaces,
  setRuntimeSyncedTripPlacesSource
} from "./data/localPlaces.js";
import { searchGooglePlacesText, type GooglePlacesTextSearchResult } from "./google/placesSearch.js";
import { estimateGoogleRoute, type GoogleRouteTravelMode } from "./google/routes.js";
import { importGooglePublicList } from "./google/publicListImport.js";
import { buildDemoGoogleSourcePreview, getGoogleSourceReadiness } from "./google/sourceAdapter.js";
import {
  addDemoTripMemberAsync,
  loadDemoTripMembersAsync,
  normalizeTripMemberDisplayName,
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
  countDemoPushSubscriptionsAsync,
  loadDemoPushSubscriptionsForMessageAsync,
  recordDemoNotificationDeliveryAsync,
  revokeDemoPushSubscriptionAsync,
  saveDemoPushSubscriptionAsync
} from "./data/localNotifications.js";
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
import { buildKodiReplyFromContext, type AgentMessageResponse } from "./agent/kodi.js";
import { tryBuildKodiReplyWithOpenAi } from "./agent/openaiAgent.js";
import { createKodiSpeechAudio } from "./agent/openaiSpeech.js";
import { reverseGeocodeLocation } from "./google/reverseGeocode.js";
import {
  buildWhatsAppKodiRoutingPlan,
  getWhatsAppConnectorReadiness,
  parseWhatsAppWebhookPayload,
  sendWhatsAppTextMessage,
  type WhatsAppSendResult,
  verifyWhatsAppWebhook
} from "./whatsapp/connector.js";
import { resolveTripReferenceForMessage } from "./agent/tripContextResolver.js";
import {
  buildTripTimelineFromGoogleMapOrder,
  resolveTimelineReferenceForMessage,
  type TripTimelineResolution
} from "./agent/tripTimelineResolver.js";
import { canMemberRunAgentAction, isAgentActionType } from "./permissions/agentActions.js";
import type { AgeGroup, TripEventType, TripPlace } from "./domain/types.js";

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
const processedWhatsAppMessageIds = new Set<string>();
const recentWhatsAppWebhookDiagnostics: Array<{
  receivedAt: string;
  path: string;
  parsedTextMessages: number;
  statusEvents: number;
  messageTypes: string[];
  textPreviews: string[];
}> = [];
const recentWhatsAppProcessingDiagnostics: Array<{
  receivedAt: string;
  status: "dry_run" | "queued" | "duplicate" | "processed" | "failed";
  providerMessageId: string;
  fromMasked: string;
  step?: string;
  memberId?: string;
  memberMessageId?: string;
  kodiMessageId?: string;
  outboundStatus?: WhatsAppSendResult["status"];
  outboundRecipientMasked?: string;
  error?: string;
}> = [];

function maskDiagnosticWhatsAppText(text: string) {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length > 80 ? `${trimmed.slice(0, 80)}...` : trimmed;
}

function collectWhatsAppWebhookStatusCount(payload: unknown) {
  if (typeof payload !== "object" || payload === null || !Array.isArray((payload as { entry?: unknown }).entry)) {
    return 0;
  }

  let statusEvents = 0;
  for (const entry of (payload as { entry: unknown[] }).entry) {
    if (typeof entry !== "object" || entry === null || !Array.isArray((entry as { changes?: unknown }).changes)) {
      continue;
    }

    for (const change of (entry as { changes: unknown[] }).changes) {
      const value = (change as { value?: unknown })?.value;
      if (typeof value !== "object" || value === null || !Array.isArray((value as { statuses?: unknown }).statuses)) {
        continue;
      }

      statusEvents += (value as { statuses: unknown[] }).statuses.length;
    }
  }

  return statusEvents;
}

function rememberWhatsAppWebhookDiagnostic(
  payload: unknown,
  messages: ReturnType<typeof parseWhatsAppWebhookPayload>,
  path = "/api/whatsapp/webhook"
) {
  recentWhatsAppWebhookDiagnostics.push({
    receivedAt: new Date().toISOString(),
    path,
    parsedTextMessages: messages.length,
    statusEvents: collectWhatsAppWebhookStatusCount(payload),
    messageTypes: [...new Set(messages.map((message) => message.rawType))],
    textPreviews: messages.map((message) => maskDiagnosticWhatsAppText(message.text))
  });

  if (recentWhatsAppWebhookDiagnostics.length > 20) {
    recentWhatsAppWebhookDiagnostics.splice(0, recentWhatsAppWebhookDiagnostics.length - 20);
  }
}

function maskDiagnosticError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/EAA[a-zA-Z0-9_-]{20,}/g, "EAA...masked").slice(0, 240);
}

function rememberWhatsAppProcessingDiagnostic(
  entry: (typeof recentWhatsAppProcessingDiagnostics)[number]
) {
  recentWhatsAppProcessingDiagnostics.push(entry);

  if (recentWhatsAppProcessingDiagnostics.length > 30) {
    recentWhatsAppProcessingDiagnostics.splice(0, recentWhatsAppProcessingDiagnostics.length - 30);
  }
}

function isWhatsAppWebhookDryRun(req: express.Request) {
  return req.query.dryRun === "1" || req.header("x-kodi-webhook-dry-run") === "true";
}

function getMetaGraphApiVersion() {
  return process.env.WHATSAPP_GRAPH_API_VERSION?.trim() || "v20.0";
}

function getMaskedEnvValue(name: string) {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    return "";
  }

  return value.length <= 6 ? "set" : `${value.slice(0, 3)}...${value.slice(-3)}`;
}

async function fetchWhatsAppGraphDiagnostic(path: string, init?: RequestInit) {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() ?? "";
  if (!accessToken) {
    return {
      ok: false,
      status: 0,
      error: "missing WHATSAPP_ACCESS_TOKEN"
    };
  }

  const response = await fetch(`https://graph.facebook.com/${getMetaGraphApiVersion()}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${accessToken}`
    }
  });
  const payload = (await response.json().catch(() => undefined)) as unknown;

  return {
    ok: response.ok,
    status: response.status,
    payload
  };
}

function getWhatsAppSubscribedAppIds(result: Awaited<ReturnType<typeof fetchWhatsAppGraphDiagnostic>>) {
  const payload = result.payload;
  if (typeof payload !== "object" || payload === null || !Array.isArray((payload as { data?: unknown }).data)) {
    return [];
  }

  return (payload as { data: unknown[] }).data
    .map((item) => {
      if (typeof item !== "object" || item === null) {
        return "";
      }

      const id = (item as { id?: unknown }).id;
      const nested = (item as { whatsapp_business_api_data?: { id?: unknown } }).whatsapp_business_api_data;
      return typeof id === "string" ? id : typeof nested?.id === "string" ? nested.id : "";
    })
    .filter(Boolean);
}

async function ensureWhatsAppBusinessAccountSubscription() {
  const connector = getWhatsAppConnectorReadiness();
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ?? "";

  if (!connector.ready || !businessAccountId) {
    return {
      attempted: false,
      ok: false,
      reason: "connector_not_ready",
      result: undefined as Awaited<ReturnType<typeof fetchWhatsAppGraphDiagnostic>> | undefined
    };
  }

  const result = await fetchWhatsAppGraphDiagnostic(`/${businessAccountId}/subscribed_apps`, {
    method: "POST"
  });

  return {
    attempted: true,
    ok: result.ok,
    reason: result.ok ? "subscription_ensured" : "meta_graph_rejected_subscription",
    result
  };
}

function getWhatsAppGraphErrorCode(result: Awaited<ReturnType<typeof fetchWhatsAppGraphDiagnostic>>) {
  const payload = result.payload;
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const error = (payload as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  const subcode = (error as { error_subcode?: unknown }).error_subcode;
  const message = (error as { message?: unknown }).message;

  return {
    code: typeof code === "number" ? code : undefined,
    subcode: typeof subcode === "number" ? subcode : undefined,
    message: typeof message === "string" ? message : undefined
  };
}

function classifyWhatsAppGraphToken(result: Awaited<ReturnType<typeof fetchWhatsAppGraphDiagnostic>>) {
  if (result.ok) {
    return "valid" as const;
  }

  if (result.error === "missing WHATSAPP_ACCESS_TOKEN") {
    return "missing" as const;
  }

  const graphError = getWhatsAppGraphErrorCode(result);
  if (graphError?.code === 190 || graphError?.message?.toLowerCase().includes("access token")) {
    return "expired_or_invalid" as const;
  }

  return "unknown_error" as const;
}

function buildWhatsAppLiveReadinessReport(input: {
  subscribedApps: Awaited<ReturnType<typeof fetchWhatsAppGraphDiagnostic>>;
  phoneNumbers: Awaited<ReturnType<typeof fetchWhatsAppGraphDiagnostic>>;
  subscriptionEnsure?: Awaited<ReturnType<typeof ensureWhatsAppBusinessAccountSubscription>>;
}) {
  const connector = getWhatsAppConnectorReadiness();
  const subscribedAppsTokenStatus = classifyWhatsAppGraphToken(input.subscribedApps);
  const phoneNumbersTokenStatus = classifyWhatsAppGraphToken(input.phoneNumbers);
  const accessTokenStatus =
    subscribedAppsTokenStatus === "valid" || subscribedAppsTokenStatus === "unknown_error"
      ? phoneNumbersTokenStatus
      : subscribedAppsTokenStatus;
  const phoneNumbersReachable = input.phoneNumbers.ok;
  const subscribedAppIds = getWhatsAppSubscribedAppIds(input.subscribedApps);
  const subscriptionReachable = input.subscribedApps.ok;
  const subscriptionEnsured = input.subscriptionEnsure?.ok === true;
  const liveReady =
    connector.ready &&
    accessTokenStatus === "valid" &&
    phoneNumbersReachable &&
    subscriptionReachable &&
    subscriptionEnsured;
  const blockers: string[] = [];

  if (!connector.enabled) {
    blockers.push("connector_disabled");
  }

  for (const missing of connector.missing) {
    blockers.push(`missing_${missing.toLowerCase()}`);
  }

  if (accessTokenStatus === "missing") {
    blockers.push("missing_access_token");
  }

  if (accessTokenStatus === "expired_or_invalid") {
    blockers.push("expired_or_invalid_access_token");
  }

  if (accessTokenStatus === "unknown_error") {
    blockers.push("meta_graph_access_error");
  }

  if (connector.ready && accessTokenStatus === "valid" && !phoneNumbersReachable) {
    blockers.push("phone_numbers_not_reachable");
  }

  if (connector.ready && accessTokenStatus === "valid" && !subscriptionReachable) {
    blockers.push("whatsapp_business_account_subscription_not_reachable");
  }

  if (
    connector.ready &&
    accessTokenStatus === "valid" &&
    subscriptionReachable &&
    input.subscriptionEnsure?.attempted &&
    !input.subscriptionEnsure.ok
  ) {
    blockers.push("whatsapp_business_account_subscription_failed");
  }

  const nextAction = !connector.enabled
    ? "enable_whatsapp_connector"
    : connector.missing.length > 0
      ? "complete_render_whatsapp_environment"
      : accessTokenStatus === "missing"
        ? "set_whatsapp_access_token"
        : accessTokenStatus === "expired_or_invalid"
          ? "replace_whatsapp_access_token_with_permanent_system_user_token"
          : accessTokenStatus === "unknown_error"
            ? "inspect_meta_graph_error"
            : !phoneNumbersReachable
              ? "verify_whatsapp_business_account_phone_number_access"
              : !subscriptionReachable || (input.subscriptionEnsure?.attempted && !input.subscriptionEnsure.ok)
                ? "connect_whatsapp_business_account_to_kodi_app"
                : "none";

  const userMessage = liveReady
    ? "WhatsApp connector is live-ready."
    : accessTokenStatus === "expired_or_invalid"
      ? "The configured Meta access token is expired or invalid. Replace WHATSAPP_ACCESS_TOKEN in Render with a permanent system-user token before expecting WhatsApp replies."
      : "Webhook setup exists, but live WhatsApp messaging is not ready yet. Do not treat this as a working WhatsApp agent until the listed blockers are cleared.";

  return {
    liveReady,
    stage: liveReady ? "live_ready" : connector.ready ? "configured_but_not_live" : connector.status,
    accessTokenStatus,
    phoneNumbersReachable,
    subscriptionReachable,
    subscriptionEnsured,
    subscribedAppCount: subscribedAppIds.length,
    blockers,
    nextAction,
    userMessage
  };
}

function rememberProcessedWhatsAppMessage(messageId: string) {
  processedWhatsAppMessageIds.add(messageId);

  if (processedWhatsAppMessageIds.size > 500) {
    const [oldest] = processedWhatsAppMessageIds;
    if (oldest) {
      processedWhatsAppMessageIds.delete(oldest);
    }
  }
}

function getAgentTripStateSnapshotTimeoutMs() {
  const timeoutMs = Number(process.env.AGENT_TRIP_STATE_TIMEOUT_MS);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return 2500;
  }

  return Math.min(Math.max(Math.round(timeoutMs), 500), 8000);
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, errorMessage: string): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function isGoogleMapsViewingLink(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.includes("maps.app.goo.gl") || normalized.includes("google.com/maps");
}

function canManageTripMapSource(member: Awaited<ReturnType<typeof loadDemoTripMembersAsync>>[number] | undefined) {
  return member?.member.role === "owner" || member?.member.role === "admin" || member?.member.canManagePlaces === true;
}

function getWebPushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() || "";
}

function getWebPushPrivateKey() {
  return process.env.VAPID_PRIVATE_KEY?.trim() || "";
}

function hasWebPushSenderConfig() {
  return getWebPushPublicKey().length > 0 && getWebPushPrivateKey().length > 0;
}

function getWebPushSubject() {
  return process.env.VAPID_SUBJECT?.trim() || "mailto:kodi-travel-companion@example.com";
}

function configureWebPushSender() {
  const publicKey = getWebPushPublicKey();
  const privateKey = getWebPushPrivateKey();
  if (!publicKey || !privateKey) {
    return false;
  }

  webpush.setVapidDetails(getWebPushSubject(), publicKey, privateKey);
  return true;
}

function isPushSubscriptionPayload(value: unknown): value is { endpoint: string; keys: { p256dh: string; auth: string } } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  return (
    typeof candidate.endpoint === "string" &&
    candidate.endpoint.startsWith("https://") &&
    typeof candidate.keys?.p256dh === "string" &&
    candidate.keys.p256dh.length > 0 &&
    typeof candidate.keys?.auth === "string" &&
    candidate.keys.auth.length > 0
  );
}

function buildNotificationBody(author: string, source: "member" | "agent" | "system") {
  if (source === "agent") {
    return "קודי כתב הודעה חדשה בקבוצת הטיול.";
  }

  return `${author} כתב/ה הודעה חדשה בקבוצת הטיול.`;
}

async function sendChatMessageNotifications(input: {
  messageId?: string;
  author: string;
  text: string;
  source: "member" | "agent" | "system";
  senderMemberId?: string;
}) {
  if (input.source === "system" || !configureWebPushSender()) {
    return {
      status: "not_configured",
      attempted: 0,
      sent: 0,
      failed: 0
    };
  }

  const subscriptions = await loadDemoPushSubscriptionsForMessageAsync(input.senderMemberId);
  let sent = 0;
  let failed = 0;

  await Promise.all(
    subscriptions.map(async (subscription) => {
      const payload = JSON.stringify({
        title: "קבוצת הטיול",
        body: buildNotificationBody(input.author, input.source),
        url: "/"
      });

      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: subscription.keys
          },
          payload
        );
        sent += 1;
        await recordDemoNotificationDeliveryAsync({
          messageId: input.messageId,
          recipientMemberId: subscription.memberId,
          subscriptionId: subscription.id,
          status: "sent"
        });
      } catch (error) {
        failed += 1;
        const statusCode =
          typeof error === "object" && error && "statusCode" in error ? Number((error as { statusCode?: unknown }).statusCode) : 0;
        const providerError = error instanceof Error ? error.message : "web_push_send_failed";
        const status = statusCode === 404 || statusCode === 410 ? "revoked" : "failed";

        if (status === "revoked") {
          await revokeDemoPushSubscriptionAsync(subscription.endpoint);
        }

        await recordDemoNotificationDeliveryAsync({
          messageId: input.messageId,
          recipientMemberId: subscription.memberId,
          subscriptionId: subscription.id,
          status,
          providerError
        });
      }
    })
  );

  return {
    status: "sent",
    attempted: subscriptions.length,
    sent,
    failed
  };
}

async function buildKodiMemberWelcomeMessage(memberName: string) {
  const setupState = await buildDemoTripSetupStateAsync();
  const tripName = setupState.setupSummary?.tripName?.trim() || "הטיול";
  return `ברוך הבא ${memberName} לקבוצת הטיול ל${tripName} 🙂 שמחים שאתה איתנו. אני קודי, סוכן הטיול של הקבוצה, כאן כדי לעזור במסלול, במפה, בנקודות עניין, בניווט ובהמלצות בדרך.`;
}

async function buildAgentTripStateSnapshot() {
  const now = Date.now();
  if (agentTripStateCache && agentTripStateCacheMs > 0 && now - agentTripStateCache.loadedAt <= agentTripStateCacheMs) {
    return agentTripStateCache.state;
  }

  let state: ReturnType<typeof buildDemoTripState>;
  try {
    state = await withTimeout(
      buildDemoTripStateAsync(),
      getAgentTripStateSnapshotTimeoutMs(),
      "agent_trip_state_snapshot_timeout"
    );
  } catch (error) {
    console.warn("Agent trip snapshot fallback used", error instanceof Error ? error.message : error);
    state = buildDemoTripState();
  }

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
  externalPlacesSearchRequest?: GooglePlacesTextSearchResult["request"];
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
    externalPlacesSearchRequest: input.externalPlacesSearchRequest,
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

function sanitizeProviderErrorForRuntime(error: string | undefined) {
  if (!error) {
    return undefined;
  }

  return error
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted-token]")
    .slice(0, 220);
}

function includesAnyTerm(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function includesHebrewLiveLocationCue(text: string) {
  return [
    /\u05d1\u05d0\u05d6\u05d5\u05e8(?:\s+\u05e9\u05dc\u05d9|\s+\u05d4\u05e0\u05d5\u05db\u05d7\u05d9)?/u,
    /\u05d1\u05e1\u05d1\u05d9\u05d1\u05d4/u,
    /\u05dc\u05d9\u05d3\u05d9/u,
    /\u05dc\u05d9\u05d3\u05d9\u05e0\u05d5/u,
    /\u05e7\u05e8\u05d5\u05d1\s+\u05d0\u05dc\u05d9(?:\u05d9)?/u,
    /\u05d0\u05d9\u05e4\u05d4\s+\u05d0\u05e0\u05d9/u,
    /\u05de\u05d9\u05e7\u05d5\u05dd\s+\u05e2\u05db\u05e9\u05d5\u05d5\u05d9/u,
    /\u05db\u05d0\u05df\s+\u05d5\u05e2\u05db\u05e9\u05d9\u05d5/u
  ].some((pattern) => pattern.test(text));
}

function includesConcreteGooglePlacesCue(text: string) {
  return [
    /\u05d1\u05d9\u05ea\s+\u05e7\u05e4\u05d4/u,
    /\u05e7\u05e4\u05d4/u,
    /\u05de\u05d0\u05e4(?:\u05d9\u05d9\u05d4|\u05d9\u05d4)/u,
    /\u05de\u05e1\u05e2\u05d3\u05d4/u,
    /\u05d2\u05dc\u05d9\u05d3\u05d4/u,
    /\u05d0\u05d8\u05e8\u05e7\u05e6\u05d9\u05d4/u,
    /\u05e9\u05d9\u05e8\u05d5\u05ea\u05d9\u05dd/u,
    /\u05ea\u05d7\u05e0\u05ea\s+\u05d3\u05dc\u05e7/u,
    /\u05d3\u05dc\u05e7/u,
    /\u05d1\u05d9\u05ea\s+\u05de\u05e8\u05e7\u05d7\u05ea/u,
    /\u05db\u05e1\u05e4\u05d5\u05de\u05d8/u,
    /\u05e6'\u05d9\u05d9\u05e0\u05d2/u,
    /\u05e6\u05f3\u05d9\u05d9\u05e0\u05d2/u
  ].some((pattern) => pattern.test(text));
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
      "סמן לי על המפה",
      "סמן את המסלול",
      "צייר לי",
      "route map",
      "route diagram",
      "trip sketch"
    ]) &&
    includesAnyTerm(normalizedMessage, ["מסלול", "טיול", "מפה", "יוון", "trip", "route", "map"])
  );
}

function shouldUseTripStructureAnswer(message: string) {
  const normalizedMessage = message.toLowerCase();
  const lodgingCue = includesAnyTerm(normalizedMessage, [
    "מלונות",
    "מלון",
    "לינות",
    "לינה",
    "איפה ישנים",
    "איפה ישן",
    "איפה נישן",
    "מקומות לינה",
    "hotel",
    "lodging"
  ]);
  const orderCue = includesAnyTerm(normalizedMessage, [
    "לפי הסדר",
    "בסדר",
    "הסדר",
    "ראשון",
    "אחרון",
    "רצף",
    "שרשרת",
    "timeline",
    "order"
  ]);

  return (
    shouldUseDeterministicRouteDiagram(message) ||
    (lodgingCue && (orderCue || includesAnyTerm(normalizedMessage, ["מה המלונות", "איפה ישנים"]))) ||
    includesAnyTerm(normalizedMessage, ["מה אופי הטיול", "אופי הטיול", "מה מצפה לנו", "מה מחכה לנו"])
  );
}

function shouldUseExternalPlacesSearch(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (shouldUseTripStructureAnswer(message)) {
    return false;
  }

  if (includesHebrewLiveLocationCue(message) || includesConcreteGooglePlacesCue(message)) {
    return true;
  }

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
    "שנורקל",
    "צלילה",
    "snorkel",
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

function shouldUseFastConcretePlacesReply(message: string, rulesReply: AgentMessageResponse, externalPlacesSearch?: GooglePlacesTextSearchResult) {
  if (rulesReply.intent !== "place_recommendation" || externalPlacesSearch?.status !== "ready" || externalPlacesSearch.places.length === 0) {
    return false;
  }

  if (includesConcreteGooglePlacesCue(message)) {
    return true;
  }

  return includesAnyTerm(message.toLowerCase(), [
    "בית קפה",
    "קפה",
    "coffee",
    "cafe",
    "מאפייה",
    "מאפיה",
    "bakery",
    "מסעדה",
    "טברנה",
    "restaurant",
    "taverna",
    "גלידה",
    "ice cream",
    "gelato",
    "שירותים",
    "toilet",
    "toilets",
    "דלק",
    "fuel",
    "בית מרקחת",
    "pharmacy",
    "כספומט",
    "atm"
  ]);
}

function buildExternalPlacesQuery(message: string, options: { hereAndNow?: boolean } = {}) {
  const normalizedMessage = message
    .replace(/קודי[, ]*/g, "")
    .replace(/\?/g, "")
    .replace(/אזור שלי/g, "")
    .replace(/בסביבה שלי/g, "")
    .replace(/קרוב אליי/g, "")
    .replace(/קרוב אלי/g, "")
    .replace(/כאן/g, "")
    .trim();

  if (shouldReverseGeocodeCurrentLocation(message)) {
    return "school nearby";
  }

  if (includesAnyTerm(message, ["מאפייה", "מאפיה", "לחם", "מאפים", "קונדיטוריה", "bakery"])) {
    return options.hereAndNow ? "bakery" : "bakery nearby";
  }

  if (includesAnyTerm(message, ["בית קפה", "קפה", "coffee", "cafe"])) {
    return options.hereAndNow ? "cafe" : "cafe nearby";
  }

  if (includesAnyTerm(message, ["גלידה", "מתוק", "קינוח", "ice cream", "gelato"])) {
    return options.hereAndNow ? "ice cream" : "gelato ice cream nearby";
  }

  if (includesAnyTerm(message, ["שירותים", "WC", "toilet", "toilets"])) {
    return options.hereAndNow ? "public toilets" : "public toilets nearby";
  }

  if (includesAnyTerm(message, ["בית מרקחת", "פארם", "תרופה", "pharmacy"])) {
    return options.hereAndNow ? "pharmacy" : "pharmacy nearby";
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
      "ארוחה"
    ])
  ) {
    return options.hereAndNow ? "restaurant" : "taverna restaurant near hotel";
  }

  if (normalizedMessage.length >= 3) {
    return options.hereAndNow ? normalizedMessage : `${normalizedMessage} nearby`;
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

function hasCoordinates(value: { lat?: unknown; lng?: unknown } | undefined | null): value is { lat: number; lng: number } {
  return typeof value?.lat === "number" && typeof value.lng === "number";
}

function hasNavigationUrl(text: string) {
  return /(?:waze\.com\/ul|waze:\/\/|google\.com\/maps|maps\.app\.goo\.gl)/i.test(text);
}

function shouldAppendNavigationLinks(reply: AgentMessageResponse) {
  return ["place_recommendation", "route_creation", "group_location"].includes(reply.intent);
}

function findTripPlaceById(tripState: ReturnType<typeof buildDemoTripState>, placeId: string | undefined) {
  if (!placeId) {
    return undefined;
  }

  return tripState.places.find((place) => place.id === placeId && hasCoordinates(place));
}

function findFirstExternalPlaceWithCoordinates(search: GooglePlacesTextSearchResult | undefined) {
  if (search?.status !== "ready") {
    return undefined;
  }

  return search.places.find((place) => hasCoordinates(place) || place.googleMapsUri);
}

function getSelectedPlaceTarget(selectedPlace: unknown) {
  if (!selectedPlace || typeof selectedPlace !== "object") {
    return undefined;
  }

  const candidate = selectedPlace as Partial<TripPlace>;
  return hasCoordinates(candidate) ? candidate : undefined;
}

function buildNavigationText(target: { lat?: number; lng?: number; name?: string; label?: string; googleMapsUri?: string }) {
  const label = target.name ?? target.label ?? "הנקודה";
  const mapsUrl =
    typeof target.googleMapsUri === "string" && target.googleMapsUri.length > 0
      ? target.googleMapsUri
      : hasCoordinates(target)
        ? createNavigationLinks({ lat: target.lat, lng: target.lng, label }).googleMapsWalking
        : undefined;
  const wazeUrl = hasCoordinates(target)
    ? createNavigationLinks({ lat: target.lat, lng: target.lng, label }).waze.web
    : undefined;

  const parts = [
    mapsUrl ? `Google Maps: ${mapsUrl}` : undefined,
    wazeUrl ? `Waze: ${wazeUrl}` : undefined
  ].filter(Boolean);

  return parts.length > 0 ? `\n${parts.join("\n")}` : "";
}

function enhanceKodiReplyWithNavigationLinks(input: {
  reply: AgentMessageResponse;
  tripState: ReturnType<typeof buildDemoTripState>;
  externalPlacesSearch?: GooglePlacesTextSearchResult;
  tripDestination?: { lat: number; lng: number; label?: string };
  selectedPlace?: unknown;
  fallbackRecommendedPlaceId?: string;
  forceAppend?: boolean;
}) {
  if ((!shouldAppendNavigationLinks(input.reply) && !input.forceAppend) || hasNavigationUrl(input.reply.text)) {
    return input.reply;
  }

  const recommendedPlace = findTripPlaceById(
    input.tripState,
    input.reply.recommendedPlaceId ?? input.fallbackRecommendedPlaceId
  );
  const externalPlace = findFirstExternalPlaceWithCoordinates(input.externalPlacesSearch);
  const selectedPlace = getSelectedPlaceTarget(input.selectedPlace);
  const routeDestination = input.tripDestination;
  const target =
    recommendedPlace ??
    (externalPlace
      ? {
          lat: externalPlace.lat,
          lng: externalPlace.lng,
          name: externalPlace.displayName ?? externalPlace.formattedAddress,
          googleMapsUri: externalPlace.googleMapsUri
        }
      : undefined) ??
    selectedPlace ??
    routeDestination;
  const navigationText = target ? buildNavigationText(target) : "";

  if (!navigationText) {
    return input.reply;
  }

  return {
    ...input.reply,
    text: `${input.reply.text.trim()}${navigationText}`
  };
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
    author: "קודי" as const,
    text: `הלינה הלילה לפי ציר הטיול היא ${lodging.name}.${lodgingAddress}${foodText}`,
    intent: "place_recommendation" as const,
    requiresAdminApproval: false,
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
    "יישוב",
    "ישוב",
    "כתובת",
    "רחוב",
    "where am i",
    "current location"
  ]);
}

function shouldUsePreciseLocationIdentity(message: string) {
  return includesAnyTerm(message, [
    "איפה אני",
    "איפה אני עכשיו",
    "איפה אנחנו",
    "מיקום נוכחי",
    "אתה רואה אותי",
    "באיזה יישוב",
    "באיזה ישוב",
    "איזה יישוב",
    "איזה ישוב",
    "מה הכתובת",
    "איזו כתובת",
    "איזה רחוב",
    "שם הרחוב",
    "יישוב מדויק",
    "ישוב מדויק",
    "כתובת מדויקת",
    "רחוב מדויק",
    "where am i",
    "current address",
    "current location"
  ]);
}

function shouldUseHereAndNowContext(message: string) {
  if (includesHebrewLiveLocationCue(message)) {
    return true;
  }

  return includesAnyTerm(message, [
    "כאן",
    "לידי",
    "לידינו",
    "בסביבה",
    "באזור",
    "באזור הנוכחי",
    "סביבה שלי",
    "באזור שלי",
    "אזור שלי",
    "סביבי",
    "קרוב אליי",
    "קרוב אלי",
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

  const currentLocation = (
    context as { currentLocation?: { lat?: unknown; lng?: unknown; accuracyMeters?: unknown; updatedAt?: unknown } }
  ).currentLocation;
  if (typeof currentLocation?.lat !== "number" || typeof currentLocation.lng !== "number") {
    return undefined;
  }

  return {
    lat: currentLocation.lat,
    lng: currentLocation.lng,
    accuracyMeters: typeof currentLocation.accuracyMeters === "number" ? currentLocation.accuracyMeters : undefined,
    updatedAt: typeof currentLocation.updatedAt === "string" ? currentLocation.updatedAt : undefined
  };
}

function withRequestCurrentLocation(
  tripState: ReturnType<typeof buildDemoTripState>,
  member: { id?: unknown; displayName?: unknown; role?: unknown },
  currentLocation?: { lat: number; lng: number; accuracyMeters?: number; updatedAt?: string }
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
        accuracyMeters: currentLocation.accuracyMeters,
        updatedAt: currentLocation.updatedAt ?? now,
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
  forceLiveLocation = false,
  requestCurrentLocation?: { lat: number; lng: number }
) {
  if (forceLiveLocation && requestCurrentLocation) {
    return {
      lat: requestCurrentLocation.lat,
      lng: requestCurrentLocation.lng
    };
  }

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

async function processWhatsAppInboundMessage(message: ReturnType<typeof parseWhatsAppWebhookPayload>[number]) {
  if (processedWhatsAppMessageIds.has(message.messageId)) {
    return {
      status: "duplicate" as const,
      providerMessageId: message.messageId,
      fromMasked: message.fromMasked
    };
  }

  rememberProcessedWhatsAppMessage(message.messageId);

  const displayName = message.profileName?.trim() || `WhatsApp ${message.fromMasked}`;
  const member = await addDemoTripMemberAsync({
    displayName,
    ageGroup: "adult",
    role: "member"
  });
  const memberMessage = await appendDemoTripMessageAsync({
    author: member.member.displayName,
    text: message.text,
    memberId: member.member.id,
    source: "member"
  });

  await safeRecordTripEvent({
    eventType: "message_created",
    actorMemberId: member.member.id,
    actorName: member.member.displayName,
    relatedEntityId: memberMessage.id,
    summary: `${member.member.displayName} sent a WhatsApp message into the trip group.`
  });

  void sendChatMessageNotifications({
    messageId: memberMessage.id,
    author: member.member.displayName,
    text: memberMessage.text,
    source: "member",
    senderMemberId: member.member.id
  }).catch((error) => {
    console.warn("WhatsApp inbound push notification send failed", error);
  });

  const recentMessages = (await loadDemoTripMessagesAsync()).slice(-24);
  const agentResponse = await fetch(`http://127.0.0.1:${port}/api/agent/message`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      tripGroupId: "group_family_greece_demo",
      message: message.text,
      member: member.member,
      recentMessages,
      context: {
        source: "whatsapp",
        permissionPolicy: {
          operationalChangesRequireAdmin: true,
          canShareLiveLocation: false
        }
      }
    })
  });

  if (!agentResponse.ok) {
    const errorText = await agentResponse.text().catch(() => "");
    throw new Error(`Kodi WhatsApp agent bridge failed: HTTP ${agentResponse.status} ${errorText.slice(0, 200)}`);
  }

  const agentPayload = (await agentResponse.json()) as AgentMessageResponse;
  const kodiMessage = await appendDemoTripMessageAsync({
    author: "קודי",
    text: agentPayload.text,
    source: "agent"
  });

  await safeRecordTripEvent({
    eventType: "message_created",
    actorName: "קודי",
    relatedEntityId: kodiMessage.id,
    summary: "Kodi replied to a WhatsApp-originated message."
  });

  void sendChatMessageNotifications({
    messageId: kodiMessage.id,
    author: "קודי",
    text: kodiMessage.text,
    source: "agent"
  }).catch((error) => {
    console.warn("WhatsApp Kodi reply push notification send failed", error);
  });

  const outbound = await sendWhatsAppTextMessage({
    to: message.from,
    text: agentPayload.text
  });

  return {
    status: "processed" as const,
    providerMessageId: message.messageId,
    fromMasked: message.fromMasked,
    memberId: member.member.id,
    memberMessageId: memberMessage.id,
    kodiMessageId: kodiMessage.id,
    outbound
  };
}

app.get("/api/whatsapp/readiness", async (_req, res) => {
  const connector = getWhatsAppConnectorReadiness();
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ?? "";

  if (!connector.ready || !businessAccountId) {
    res.json({
      ...connector,
      liveReady: false,
      live: {
        liveReady: false,
        stage: connector.status,
        accessTokenStatus: connector.missing.includes("WHATSAPP_ACCESS_TOKEN") ? "missing" : "not_checked",
        blockers: connector.blockers,
        userMessage: "WhatsApp connector is not fully configured."
      }
    });
    return;
  }

  const subscriptionEnsure = await ensureWhatsAppBusinessAccountSubscription();
  const [subscribedApps, phoneNumbers] = await Promise.all([
    fetchWhatsAppGraphDiagnostic(`/${businessAccountId}/subscribed_apps`),
    fetchWhatsAppGraphDiagnostic(`/${businessAccountId}/phone_numbers?fields=id,display_phone_number,verified_name`)
  ]);
  const live = buildWhatsAppLiveReadinessReport({ subscribedApps, phoneNumbers, subscriptionEnsure });

  res.json({
    ...connector,
    liveReady: live.liveReady,
    status: live.liveReady ? "configured_not_verified" : connector.status,
    live,
    subscriptionEnsure: {
      attempted: subscriptionEnsure.attempted,
      ok: subscriptionEnsure.ok,
      reason: subscriptionEnsure.reason,
      status: subscriptionEnsure.result?.status
    }
  });
});

app.get("/api/whatsapp/diagnostics", async (_req, res) => {
  const connector = getWhatsAppConnectorReadiness();
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ?? "";
  let live: ReturnType<typeof buildWhatsAppLiveReadinessReport> | undefined;
  let subscriptionEnsure: Awaited<ReturnType<typeof ensureWhatsAppBusinessAccountSubscription>> | undefined;

  if (connector.ready && businessAccountId) {
    subscriptionEnsure = await ensureWhatsAppBusinessAccountSubscription();
    const [subscribedApps, phoneNumbers] = await Promise.all([
      fetchWhatsAppGraphDiagnostic(`/${businessAccountId}/subscribed_apps`),
      fetchWhatsAppGraphDiagnostic(`/${businessAccountId}/phone_numbers?fields=id,display_phone_number,verified_name`)
    ]);
    live = buildWhatsAppLiveReadinessReport({ subscribedApps, phoneNumbers, subscriptionEnsure });
  }

  res.json({
    connector: {
      ...connector,
      liveReady: live?.liveReady ?? false,
      status: live?.liveReady ? "configured_not_verified" : connector.status
    },
    live,
    subscriptionEnsure: subscriptionEnsure
      ? {
          attempted: subscriptionEnsure.attempted,
          ok: subscriptionEnsure.ok,
          reason: subscriptionEnsure.reason,
          status: subscriptionEnsure.result?.status
        }
      : undefined,
    recentWebhooks: recentWhatsAppWebhookDiagnostics,
    recentProcessing: recentWhatsAppProcessingDiagnostics
  });
});

app.get("/api/whatsapp/meta-diagnostics", async (_req, res) => {
  const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID?.trim() ?? "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() ?? "";

  if (!businessAccountId) {
    res.status(409).json({
      ok: false,
      error: "missing WHATSAPP_BUSINESS_ACCOUNT_ID",
      connector: getWhatsAppConnectorReadiness()
    });
    return;
  }

  const subscriptionEnsure = await ensureWhatsAppBusinessAccountSubscription();
  const [subscribedApps, phoneNumbers] = await Promise.all([
    fetchWhatsAppGraphDiagnostic(`/${businessAccountId}/subscribed_apps`),
    fetchWhatsAppGraphDiagnostic(`/${businessAccountId}/phone_numbers?fields=id,display_phone_number,verified_name`)
  ]);
  const live = buildWhatsAppLiveReadinessReport({ subscribedApps, phoneNumbers, subscriptionEnsure });

  res.json({
    ok: live.liveReady,
    live,
    connector: getWhatsAppConnectorReadiness(),
    env: {
      businessAccountId: getMaskedEnvValue("WHATSAPP_BUSINESS_ACCOUNT_ID"),
      phoneNumberId: getMaskedEnvValue("WHATSAPP_PHONE_NUMBER_ID"),
      phoneNumberIdMatchesConfigured:
        Boolean(phoneNumberId) &&
        JSON.stringify(phoneNumbers.payload ?? {}).includes(phoneNumberId)
    },
    subscriptionEnsure: {
      attempted: subscriptionEnsure.attempted,
      ok: subscriptionEnsure.ok,
      reason: subscriptionEnsure.reason,
      status: subscriptionEnsure.result?.status,
      payload: subscriptionEnsure.result?.payload
    },
    graph: {
      subscribedApps,
      phoneNumbers
    }
  });
});

function handleWhatsAppWebhookVerification(req: express.Request, res: express.Response) {
  const verification = verifyWhatsAppWebhook(req.query);

  if (!verification.ok) {
    res.status(verification.status).json({
      error: verification.reason,
      connector: getWhatsAppConnectorReadiness()
    });
    return;
  }

  res.status(200).send(verification.challenge);
}

function handleWhatsAppWebhookPost(req: express.Request, res: express.Response) {
  const readiness = getWhatsAppConnectorReadiness();
  const messages = parseWhatsAppWebhookPayload(req.body);
  const dryRun = isWhatsAppWebhookDryRun(req);
  rememberWhatsAppWebhookDiagnostic(req.body, messages, req.path);

  if (readiness.ready) {
    if (messages.length > 0 && dryRun) {
      for (const message of messages) {
        rememberWhatsAppProcessingDiagnostic({
          receivedAt: new Date().toISOString(),
          status: "dry_run",
          providerMessageId: message.messageId,
          fromMasked: message.fromMasked,
          step: "parse_only"
        });
      }
    } else if (messages.length > 0) {
      void (async () => {
        for (const message of messages) {
          rememberWhatsAppProcessingDiagnostic({
            receivedAt: new Date().toISOString(),
            status: "queued",
            providerMessageId: message.messageId,
            fromMasked: message.fromMasked,
            step: "background_processing"
          });

          try {
            const result = await processWhatsAppInboundMessage(message);
            const outbound = "outbound" in result ? result.outbound : undefined;
            rememberWhatsAppProcessingDiagnostic({
              receivedAt: new Date().toISOString(),
              status: result.status,
              providerMessageId: result.providerMessageId,
              fromMasked: result.fromMasked,
              step: result.status === "duplicate" ? "dedup" : "completed",
              memberId: "memberId" in result ? result.memberId : undefined,
              memberMessageId: "memberMessageId" in result ? result.memberMessageId : undefined,
              kodiMessageId: "kodiMessageId" in result ? result.kodiMessageId : undefined,
              outboundStatus: outbound?.status,
              outboundRecipientMasked: outbound?.recipientMasked,
              error: outbound?.error
            });
          } catch (error) {
            console.warn("WhatsApp inbound background processing failed", error);
            rememberWhatsAppProcessingDiagnostic({
              receivedAt: new Date().toISOString(),
              status: "failed",
              providerMessageId: message.messageId,
              fromMasked: message.fromMasked,
              step: "background_processing",
              error: maskDiagnosticError(error)
            });
          }
        }
      })();
    }

    res.json({
      ok: true,
      connector: readiness,
      mode: "live",
      accepted: true,
      parsedMessages: messages.length,
      processing: messages.length > 0 ? (dryRun ? "dry_run_not_queued" : "queued") : "no_text_messages"
    });
    return;
  }

  res.json({
    ok: true,
    connector: readiness,
    mode: "dry_run",
    accepted: readiness.ready,
    parsedMessages: messages.length,
    routingPlans: messages.map((message) => buildWhatsAppKodiRoutingPlan(message))
  });
}

for (const whatsAppWebhookPath of ["/api/whatsapp/webhook", "/whatsapp/webhook", "/api/webhook", "/webhook"]) {
  app.get(whatsAppWebhookPath, handleWhatsAppWebhookVerification);
  app.post(whatsAppWebhookPath, handleWhatsAppWebhookPost);
}

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
  const restrictToLocation = req.query.restrictToLocation === "true";

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
      restrictToLocation,
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
  const currentMembers = await loadDemoTripMembersAsync();
  const existingMember = currentMembers.find(
    (item) => normalizeTripMemberDisplayName(item.member.displayName) === normalizeTripMemberDisplayName(displayName)
  );

  if (existingMember) {
    res.json({
      tripGroupId: "group_family_greece_demo",
      member: existingMember,
      existingMember: true,
      members: currentMembers
    });
    return;
  }

  const member = await addDemoTripMemberAsync({
    displayName: displayName.trim(),
    ageGroup: safeAgeGroup,
    age: safeAge,
    role: "member"
  });

  await safeRecordTripEvent({
    eventType: "notification_enabled",
    actorMemberId: member.member.id,
    actorName: member.member.displayName,
    relatedEntityId: member.member.id,
    summary: `${member.member.displayName} joined the trip group.`
  });

  const welcomeMessage = await appendDemoTripMessageAsync({
    author: "קודי",
    text: await buildKodiMemberWelcomeMessage(member.member.displayName),
    memberId: member.member.id,
    source: "agent"
  });

  res.json({
    tripGroupId: "group_family_greece_demo",
    member,
    welcomeMessage,
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

app.get("/api/trips/demo/notifications/config", async (_req, res) => {
  const publicKey = getWebPushPublicKey();
  const webPushConfigured = hasWebPushSenderConfig();
  res.json({
    tripGroupId: "group_family_greece_demo",
    webPushConfigured,
    publicKey,
    subscriptionCount: await countDemoPushSubscriptionsAsync(),
    status: webPushConfigured ? "ready" : "not_configured"
  });
});

app.post("/api/trips/demo/notifications/subscriptions", async (req, res) => {
  const { memberId, subscription } = req.body ?? {};

  if (!hasWebPushSenderConfig()) {
    res.status(409).json({
      error: "web_push_not_configured",
      message: "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are required before Kodi can register real push notifications."
    });
    return;
  }

  if (typeof memberId !== "string" || memberId.trim().length < 1) {
    res.status(400).json({ error: "memberId is required" });
    return;
  }

  const members = await loadDemoTripMembersAsync();
  const member = members.find((candidate) => candidate.member.id === memberId);
  if (!member) {
    res.status(404).json({ error: "member_not_found" });
    return;
  }

  if (!isPushSubscriptionPayload(subscription)) {
    res.status(400).json({ error: "valid push subscription is required" });
    return;
  }

  await saveDemoPushSubscriptionAsync({
    memberId,
    subscription,
    userAgent: req.get("user-agent") ?? undefined
  });

  await safeRecordTripEvent({
    eventType: "member_joined",
    actorMemberId: member.member.id,
    actorName: member.member.displayName,
    relatedEntityId: member.member.id,
    summary: `${member.member.displayName} enabled message notifications on this device.`
  });

  res.json({
    tripGroupId: "group_family_greece_demo",
    status: "subscribed",
    memberId,
    subscriptionCount: await countDemoPushSubscriptionsAsync()
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
  void sendChatMessageNotifications({
    messageId: message.id,
    author: author.trim(),
    text: message.text,
    source: message.source,
    senderMemberId: memberId
  }).catch((error) => {
    console.warn("Chat push notification send failed", error);
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

app.post("/api/trips/demo/google-source/switch", async (req, res) => {
  const { actorMemberId, tripName, googleLink } = req.body ?? {};

  if (typeof actorMemberId !== "string" || actorMemberId.trim().length < 1) {
    res.status(400).json({ error: "actorMemberId is required" });
    return;
  }

  if (typeof tripName !== "string" || tripName.trim().length < 2) {
    res.status(400).json({ error: "tripName is required" });
    return;
  }

  if (typeof googleLink !== "string" || !isGoogleMapsViewingLink(googleLink)) {
    res.status(400).json({ error: "valid Google Maps viewing link is required" });
    return;
  }

  const members = await loadDemoTripMembersAsync();
  const actor = members.find((item) => item.member.id === actorMemberId.trim());
  if (!canManageTripMapSource(actor)) {
    res.status(403).json({ error: "member is not allowed to switch the trip map source" });
    return;
  }

  const currentSetupState = await buildDemoTripSetupStateAsync();
  const currentSetup = currentSetupState.setupSummary;
  const setupState = await saveDemoTripSetupStateAsync({
    tripName: tripName.trim(),
    firstMemberName: currentSetup?.firstMemberName || actor?.member.displayName || "מנהל הטיול",
    firstMemberAge: currentSetup?.firstMemberAge,
    googleLink: googleLink.trim(),
    aiPlanConfirmed: currentSetup?.savedAt ? currentSetupState.readiness.hasAiPlanExplained : true,
    locationConsentExplained: currentSetup?.savedAt ? currentSetupState.readiness.hasLocationConsentExplained : true
  });

  await safeRecordTripEvent({
    eventType: "setup_updated",
    actorMemberId: actor?.member.id,
    actorName: actor?.member.displayName,
    summary: `Trip Google Maps source switched to ${tripName.trim()}.`
  });

  res.json({
    ok: true,
    tripGroupId: setupState.tripGroupId,
    setupState,
    googleSourceSwitch: {
      tripName: tripName.trim(),
      googleLink: googleLink.trim(),
      state: setupState.googleSource.state,
      importedPlacesCount: setupState.googleSource.importedPlacesCount,
      permissions: {
        actorMemberId: actor?.member.id,
        actorRole: actor?.member.role,
        canManagePlaces: actor?.member.canManagePlaces === true
      },
      pointsSync: {
        sourceRegistered: true,
        automaticPrivateMapImport: false,
        requiresGoogleOAuth: true,
        message:
          "The active Google Maps source was changed. Full private-map point import still requires Google OAuth or an approved Google data source."
      }
    }
  });
});

app.post("/api/trips/demo/google-source/sync", async (_req, res) => {
  const setupState = await buildDemoTripSetupStateAsync();
  const sourceUrl = setupState.setupSummary?.googleLink || process.env.DEMO_GOOGLE_SOURCE_URL || DEMO_GOOGLE_SOURCE_URL;
  const syncedAt = new Date().toISOString();
  let importStatus: "imported_google_public_list" | "fallback_fixture" = "fallback_fixture";
  let importError: string | undefined;

  try {
    const imported = await importGooglePublicList(sourceUrl);

    setRuntimeSyncedTripPlacesSource({
      label: imported.listName,
      sourceUrl,
      importedAt: imported.importedAt,
      places: imported.places
    });
    importStatus = "imported_google_public_list";
  } catch (error) {
    importError = error instanceof Error ? error.message : "Unknown Google public list import error.";
  }

  const googleSource = buildDemoGoogleSourcePreview();
  const refreshedTripState = await buildDemoTripStateAsync();

  agentTripStateCache = undefined;

  await safeRecordTripEvent({
    eventType: "setup_updated",
    actorName: "Kodi",
    relatedEntityId: googleSource.source.id,
    summary:
      importStatus === "imported_google_public_list"
        ? `Trip Google Maps public list imported on app startup with ${refreshedTripState.places.length} points.`
        : `Trip Google Maps public list import failed on app startup; app kept ${refreshedTripState.places.length} fallback points.`
  });

  res.json({
    ok: true,
    tripGroupId: setupState.tripGroupId,
    setupState,
    googleSource,
    tripState: refreshedTripState,
    pointsSync: {
      automatic: true,
      trigger: "app_startup",
      sourceRegistered: setupState.readiness.hasGoogleSource,
      sourceUrl,
      importedPlacesCount: refreshedTripState.places.length,
      syncMode: googleSource.sync.mode,
      liveGoogleAccess: googleSource.adapter.liveGoogleAccess,
      importStatus,
      importError,
      canOpenGoogleMapsUrl: googleSource.sync.canOpenGoogleMapsUrl,
      canWriteBackToGoogle: googleSource.sync.canWriteBackToGoogle,
      syncedAt
    }
  });
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

  const permissionPolicy =
    context && typeof context === "object"
      ? (context as { permissionPolicy?: { operationalChangesRequireAdmin?: boolean; canShareLiveLocation?: boolean } })
          .permissionPolicy
      : undefined;

  const requestCurrentLocation = getRequestCurrentLocation(context);
  const focusedReferenceMessage = buildFocusedReferenceMessage(message, recentMessages);
  const hereAndNowContext =
    shouldUseHereAndNowContext(message) || shouldUseHereAndNowContext(focusedReferenceMessage);
  const tripState = withRequestCurrentLocation(
    req.body?.tripState ?? (await buildAgentTripStateSnapshot()),
    normalizedMember,
    requestCurrentLocation
  );
  const usagePool = buildDemoTripUsagePool({
    tripGroupId: tripState.trip.groupId,
    members: tripState.members
  });

  const timelineReference = resolveTimelineReferenceForMessage(focusedReferenceMessage, tripState);
  const fastTripAnswer = buildFastTripAnswer({
    message: focusedReferenceMessage,
    tripState,
    timelineReference
  });
  if (fastTripAnswer) {
    const enhancedFastTripAnswer = enhanceKodiReplyWithNavigationLinks({
      reply: fastTripAnswer,
      tripState,
      selectedPlace: req.body?.selectedPlace
    });
    res.json({
      ...enhancedFastTripAnswer,
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
        externalPlacesSearchRequest: undefined,
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
      query: buildExternalPlacesQuery(focusedReferenceMessage, { hereAndNow: hereAndNowContext }),
      ...getSearchLocationFromTripState(tripState, timelineReference, hereAndNowContext, requestCurrentLocation),
      radiusMeters: shouldUsePreciseLocationIdentity(focusedReferenceMessage) ? 120 : hereAndNowContext ? 15000 : 3000,
      restrictToLocation: hereAndNowContext,
      languageCode: "he"
    })
    : undefined;
  if (placesUsageGate?.allowed) {
    void safeRecordUsageGateEvent({
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
    void safeRecordUsageGateEvent({
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
  const deterministicTripStructure = shouldUseTripStructureAnswer(focusedReferenceMessage);
  const deterministicLocationIdentity = shouldUsePreciseLocationIdentity(focusedReferenceMessage);
  const fastConcretePlacesReply = shouldUseFastConcretePlacesReply(focusedReferenceMessage, rulesReply, externalPlacesSearch);
  const openAiReply =
    openAiUsageGate.allowed &&
    openAiUsageGate.providerConfigured &&
    !deterministicRouteDiagram &&
    !deterministicTripStructure &&
    !deterministicLocationIdentity &&
    !fastConcretePlacesReply
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
  if (
    openAiUsageGate.allowed &&
    openAiUsageGate.providerConfigured &&
    !deterministicRouteDiagram &&
    !deterministicTripStructure &&
    !deterministicLocationIdentity &&
    !fastConcretePlacesReply &&
    openAiReply?.status === "ready"
  ) {
    void safeRecordUsageGateEvent({
      usageGate: openAiUsageGate,
      actorName: String(normalizedMember.displayName),
      source: "kodi_agent"
    });
  }
  const selectedReply = openAiReply?.reply ?? rulesReply;
  const shouldAppendExternalPlaceNavigation =
    selectedReply.intent === "place_recommendation" && externalPlacesSearch?.status === "ready";
  const reply = enhanceKodiReplyWithNavigationLinks({
    reply: selectedReply,
    tripState,
    externalPlacesSearch,
    tripDestination: tripReference.destination,
    selectedPlace: req.body?.selectedPlace,
    fallbackRecommendedPlaceId: rulesReply.recommendedPlaceId,
    forceAppend: Boolean(rulesReply.recommendedPlaceId || routeEstimate?.route || shouldAppendExternalPlaceNavigation)
  });

  res.json({
    ...reply,
    agentRuntime: {
      openAiStatus: openAiReply?.status ?? (openAiUsageGate.providerConfigured ? "skipped" : "not_configured"),
      openAiModel: openAiReply?.model,
      openAiError: sanitizeProviderErrorForRuntime(openAiReply?.error),
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
      externalPlacesSearchRequest: externalPlacesSearch?.request,
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
  void ensureWhatsAppBusinessAccountSubscription()
    .then((result) => {
      if (result.attempted) {
        console.log(
          `WhatsApp WABA app subscription ${result.ok ? "ensured" : "not ensured"}: ${result.reason}`
        );
      }
    })
    .catch((error) => {
      console.error("WhatsApp WABA app subscription check failed", error);
    });
});
