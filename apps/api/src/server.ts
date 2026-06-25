import express from "express";
import { fileURLToPath } from "node:url";
import { buildHealthPayload } from "./health.js";
import { buildTripPlacesSummary, loadDemoTripPlaces } from "./data/localPlaces.js";
import {
  loadDemoTripMembersAsync,
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
import { getDemoStorageMetadata, verifySupabaseBridgeStorage } from "./data/demoStorage.js";
import { checkSupabaseRuntime } from "./data/supabaseStatus.js";
import {
  applySupabaseRelationalRouteMigration,
  applySupabaseSetupStateMigration,
  applySupabaseServiceRoleGrants,
  isValidMigrationAdminToken
} from "./data/supabaseMigrationAdmin.js";
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
import { canMemberRunAgentAction, isAgentActionType } from "./permissions/agentActions.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const webDistDir = process.env.WEB_DIST_DIR ?? fileURLToPath(new URL("../../web/dist", import.meta.url));

function isConversationMessage(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as { author?: unknown; text?: unknown };
  return typeof candidate.author === "string" && typeof candidate.text === "string";
}

function buildAgentContextSummary(input: {
  tripGroupId?: string;
  member: { id?: string; displayName?: string; role?: string };
  recentMessages: unknown[];
  tripState: ReturnType<typeof buildDemoTripState>;
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
    operationalChangesRequireAdmin: input.permissionPolicy?.operationalChangesRequireAdmin ?? true,
    canShareLiveLocation: input.permissionPolicy?.canShareLiveLocation ?? false
  };
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

app.get("/api/trips/demo/places", (_req, res) => {
  const places = loadDemoTripPlaces();
  res.json({
    summary: buildTripPlacesSummary(places),
    places
  });
});

app.get("/api/trips/demo/members", async (_req, res) => {
  const members = await loadDemoTripMembersAsync();
  res.json({
    tripGroupId: "group_family_greece_demo",
    members
  });
});

app.get("/api/trips/demo/messages", async (_req, res) => {
  res.json({
    tripGroupId: "group_family_greece_demo",
    messages: await loadDemoTripMessagesAsync()
  });
});

app.get("/api/trips/demo/storage", (_req, res) => {
  res.json({
    tripGroupId: "group_family_greece_demo",
    storage: getDemoStorageMetadata()
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
    bridge: await verifySupabaseBridgeStorage()
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

app.get("/api/trips/demo/group-destination", async (_req, res) => {
  res.json({
    tripGroupId: "group_family_greece_demo",
    destination: await loadDemoGroupDestinationAsync()
  });
});

app.get("/api/trips/demo/group-route", async (_req, res) => {
  res.json({
    tripGroupId: "group_family_greece_demo",
    route: await loadDemoGroupRouteAsync()
  });
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

  res.json({
    tripGroupId: "group_family_greece_demo",
    message: await appendDemoTripMessageAsync({
      author: author.trim(),
      text: text.trim(),
      memberId,
      source
    })
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

  res.json(
    await saveDemoTripSetupStateAsync({
      tripName: tripName.trim(),
      firstMemberName: firstMemberName.trim(),
      firstMemberAge,
      googleLink: googleLink.trim(),
      aiPlanConfirmed,
      locationConsentExplained
    })
  );
});

app.delete("/api/trips/demo/setup", async (_req, res) => {
  await resetDemoTripMembersAsync();
  await resetDemoTripMessagesAsync();
  await resetDemoGroupDestinationAsync();
  await resetDemoGroupRouteAsync();
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

  const tripState = req.body?.tripState ?? (await buildDemoTripStateAsync());
  const permissionPolicy =
    context && typeof context === "object"
      ? (context as { permissionPolicy?: { operationalChangesRequireAdmin?: boolean; canShareLiveLocation?: boolean } })
          .permissionPolicy
      : undefined;
  const reply = buildKodiReplyFromContext({
    ...req.body,
    tripState
  });

  res.json({
    ...reply,
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
