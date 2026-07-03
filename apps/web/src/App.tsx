import {
  CheckCircle2,
  Download,
  ExternalLink,
  MapPin,
  Menu,
  Mic,
  Navigation,
  Radio,
  ShieldCheck,
  Share2,
  Sparkles,
  Trash2,
  Users,
  Volume2,
  VolumeX
} from "lucide-react";
import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { demoMembers, demoMessages, demoPlaces, demoTripSummary } from "./demoTrip.js";

type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  abort: () => void;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;

type BrowserSpeechRecognitionEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type PlaceType = "lodging" | "attraction" | "water" | "food" | "transport" | "stop" | "unknown";
type PlaceListFilter = "route" | "nearby" | "all" | "lodging" | "attractions";
type ActivationStep = "welcome" | "google" | "manager_location" | "ready";
const DEFAULT_NEARBY_MAP_RADIUS_KM = 40;
const DEFAULT_VISIBLE_PLACE_LIMIT = 40;
const LOCAL_SETUP_COMPLETE_KEY = "kodi-trip-setup-complete";
const LOCAL_REMOVED_PLACE_IDS_KEY = "kodi-removed-place-ids";
const GOOGLE_MAPS_SCRIPT_ID = "kodi-google-maps-js";
const retiredDemoMemberIds = new Set(["dad", "noa", "grandma"]);
const retiredDemoNames = new Set(["אבא", "אמא", "נועה", "סבתא", "QA"]);
const retiredMessageFragments = [
  "Averof 12",
  "יעד הקבוצתי הנוכחי",
  "מסלול קבוצתי קצר סביב",
  "התחנה הפעילה הבאה במסלול",
  "QA live route"
];

declare global {
  interface Window {
    google?: {
      maps: any;
    };
    __kodiGoogleMapsPromise?: Promise<void>;
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}

interface TripPlace {
  id: string;
  sourceIndex?: number;
  name: string;
  type: PlaceType;
  address?: string;
  lat?: number;
  lng?: number;
  note?: string;
  tags: string[];
}

interface TripPlacesSummary {
  total: number;
  lodgingCount: number;
  waterCount: number;
  byType: Record<string, number>;
}

interface TripPlacesResponse {
  summary: TripPlacesSummary;
  places: TripPlace[];
}

interface NavigationLinksResponse {
  label: string | null;
  waze: {
    app: string;
    web: string;
  };
  googleMaps: string;
  googleMapsWalking: string;
}

interface AgentActionAuthorizationResponse {
  allowed: boolean;
  requiresAdminApproval: boolean;
  reason: string;
}

interface GroupDestination {
  tripGroupId: string;
  placeId: string;
  placeName: string;
  address?: string;
  lat?: number;
  lng?: number;
  setByMemberId: string;
  setByName: string;
  setAt: string;
}

interface GroupDestinationResponse {
  tripGroupId: string;
  destination: GroupDestination | null;
}

interface GroupRoute {
  tripGroupId: string;
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
}

interface GroupRouteResponse {
  tripGroupId: string;
  route: GroupRoute | null;
}

interface AgentMessageResponse {
  author: "קודי";
  text: string;
  intent: string;
  requiresAdminApproval: boolean;
  source: string;
  contextSummary?: {
    tripGroupId: string;
    memberId: string;
    memberName: string;
    memberRole: string;
    recentMessagesCount: number;
    hasTripState: boolean;
    visibleLiveLocationMembers: number;
    operationalChangesRequireAdmin: boolean;
    canShareLiveLocation: boolean;
  };
}

interface ChatMessage {
  id?: string;
  author: string;
  text: string;
  memberId?: string;
  source?: "member" | "agent" | "system";
  createdAt?: string;
}

interface UserShortcut {
  id: string;
  label: string;
  url: string;
}

interface CurrentLocationState {
  lat: number;
  lng: number;
  accuracyMeters?: number;
  updatedAt: string;
}

interface DemoMember {
  id: string;
  name: string;
  role: string;
  ageGroup: string;
  locationSharing: "enabled" | "disabled" | "pending";
  liveLocation: {
    lat: number;
    lng: number;
    label: string;
    updatedMinutesAgo: number;
  } | null;
}

function getLocalSetupCompleted() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(LOCAL_SETUP_COMPLETE_KEY) === "true";
}

function rememberLocalSetupCompleted() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(LOCAL_SETUP_COMPLETE_KEY, "true");
}

function getLocallyRemovedPlaceIds() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    const parsed = JSON.parse(window.localStorage.getItem(LOCAL_REMOVED_PLACE_IDS_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function rememberLocallyRemovedPlaceId(placeId: string) {
  if (typeof window === "undefined") {
    return;
  }

  const removedPlaceIds = getLocallyRemovedPlaceIds();
  removedPlaceIds.add(placeId);
  window.localStorage.setItem(LOCAL_REMOVED_PLACE_IDS_KEY, JSON.stringify([...removedPlaceIds]));
}

function applyLocalPlaceRemovals(nextPlaces: TripPlace[]) {
  const removedPlaceIds = getLocallyRemovedPlaceIds();
  return nextPlaces.filter((place) => !removedPlaceIds.has(place.id));
}

function buildTripSummaryFromPlaces(nextPlaces: TripPlace[]): TripPlacesSummary {
  return {
    total: nextPlaces.length,
    lodgingCount: nextPlaces.filter((place) => place.type === "lodging").length,
    waterCount: nextPlaces.filter((place) => place.type === "water").length,
    byType: nextPlaces.reduce<Record<string, number>>((counts, place) => {
      counts[place.type] = (counts[place.type] ?? 0) + 1;
      return counts;
    }, {})
  };
}

function getSafeManagerName(managerName = "מנהל הטיול") {
  const trimmedName = managerName.trim();
  return trimmedName.length > 1 && !retiredDemoNames.has(trimmedName) ? trimmedName : "מנהל הטיול";
}

function sanitizeChatMessages(chatMessages: ChatMessage[]) {
  return chatMessages.filter((message) => {
    if (retiredDemoNames.has(message.author)) {
      return false;
    }

    const text = `${message.author}\n${message.text}`;
    return !retiredMessageFragments.some((fragment) => text.includes(fragment));
  });
}

function getMessageKey(message: ChatMessage) {
  if (message.id) {
    return message.id;
  }

  return `${message.source ?? "local"}:${message.author}:${message.createdAt ?? ""}:${message.text}`;
}

function getMessageFingerprint(message: ChatMessage) {
  return `${message.source ?? "unknown"}:${message.author}:${message.memberId ?? ""}:${message.text}`;
}

function mergeChatMessages(currentMessages: ChatMessage[], incomingMessages: ChatMessage[]) {
  const cleanIncomingMessages = sanitizeChatMessages(incomingMessages);
  const incomingFingerprints = new Set(cleanIncomingMessages.map(getMessageFingerprint));
  const merged = new Map<string, ChatMessage>();

  currentMessages.forEach((message) => {
    if (message.id?.startsWith("local-") && incomingFingerprints.has(getMessageFingerprint(message))) {
      return;
    }

    merged.set(getMessageKey(message), message);
  });

  cleanIncomingMessages.forEach((message) => {
    merged.set(getMessageKey(message), message);
  });

  return [...merged.values()].sort((first, second) => {
    const firstTime = first.createdAt ? Date.parse(first.createdAt) : Number.MAX_SAFE_INTEGER;
    const secondTime = second.createdAt ? Date.parse(second.createdAt) : Number.MAX_SAFE_INTEGER;
    if (Number.isNaN(firstTime) || Number.isNaN(secondTime)) {
      return 0;
    }

    return firstTime - secondTime;
  });
}

function normalizeTripMembers(members: DemoMember[], managerName = "מנהל הטיול"): DemoMember[] {
  const visibleMembers = members.filter((member) => !retiredDemoMemberIds.has(member.id));
  const ownerIndex = visibleMembers.findIndex((member) => member.role === "owner" || member.id === "mom");
  const safeManagerName = getSafeManagerName(managerName);

  if (ownerIndex >= 0) {
    return visibleMembers.map((member, index) =>
      index === ownerIndex
        ? {
            ...member,
            name: safeManagerName,
            role: "owner"
          }
        : member
    );
  }

  const fallbackManager: DemoMember = {
    id: "mom",
    name: safeManagerName,
    role: "owner",
    ageGroup: "adult",
    locationSharing: "disabled",
    liveLocation: null
  };

  return [
    {
      ...fallbackManager
    }
  ];
}

interface TripMemberLocationResponse {
  tripGroupId: string;
  members: Array<{
    member: {
      id: string;
      displayName: string;
      role: string;
      ageGroup?: string;
    };
    consent: {
      state: "enabled" | "disabled" | "pending";
    };
    liveLocation: {
      lat: number;
      lng: number;
    } | null;
    displayLabel?: string;
    updatedMinutesAgo?: number;
  }>;
}

interface TripMessagesResponse {
  tripGroupId: string;
  messages: ChatMessage[];
}

interface TripEvent {
  id: string;
  tripGroupId: string;
  eventType:
    | "message_created"
    | "location_updated"
    | "destination_set"
    | "route_created"
    | "route_progressed"
    | "member_joined"
    | "member_left"
    | "setup_updated"
    | "system";
  actorMemberId?: string;
  actorName?: string;
  relatedEntityId?: string;
  summary: string;
  createdAt: string;
}

interface TripEventsResponse {
  tripGroupId: string;
  eventLog: {
    driver: "file" | "supabase";
    eventLogReady: boolean;
    checkedAt: string;
    error?: string;
  };
  events: TripEvent[];
}

type UsageAuditSource = "direct_api" | "kodi_agent" | "unknown";

interface UsageAuditOverview {
  totalAuthorizedCalls: number;
  googlePlacesCalls: number;
  googleRoutesCalls: number;
  kodiAgentCalls: number;
  directApiCalls: number;
  lastSource: UsageAuditSource;
  lastCapability?: string;
}

interface TripStateResponse {
  trip: {
    id: string;
    groupId: string;
    name: string;
    groupName: string;
  };
  summary: TripPlacesSummary;
  places: TripPlace[];
  members: TripMemberLocationResponse["members"];
  groupDestination?: GroupDestination | null;
  groupRoute?: GroupRoute | null;
}

interface GroupRouteResponse {
  tripGroupId: string;
  route: GroupRoute | null;
}

interface TripSetupStep {
  id: string;
  title: string;
  status: "done" | "current" | "pending";
  description: string;
}

interface TripSetupStateResponse {
  tripGroupId: string;
  currentStep: string;
  setupCompleted: boolean;
  aiPlanMode: "limited" | "full";
  setupSummary?: {
    tripName: string;
    firstMemberName: string;
    firstMemberAge?: number;
    googleLink: string;
    savedAt: string;
  };
  googleSource: {
    state: string;
    sourceType: string;
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
  steps: TripSetupStep[];
  kodiWelcomeMessage: string;
}

interface TripMapSourceSwitchResponse {
  ok: boolean;
  tripGroupId: string;
  setupState: TripSetupStateResponse;
  googleSourceSwitch: {
    tripName: string;
    googleLink: string;
    state: string;
    importedPlacesCount: number;
    pointsSync: {
      sourceRegistered: boolean;
      automaticPrivateMapImport: boolean;
      requiresGoogleOAuth: boolean;
      message: string;
    };
  };
}

interface GoogleSourcePreviewResponse {
  tripGroupId: string;
  adapter: {
    kind: "fixture" | "google_api" | string;
    name: string;
    liveGoogleAccess: boolean;
  };
  source: {
    id: string;
    type: string;
    state: "read_only_preview" | string;
    displayName: string;
    sourceUrl: string;
    fixtureFileName: string;
    importedPlacesCount: number;
    placesWithCoordinates: number;
    placesMissingCoordinates: number;
    placesWithGoogleIds: number;
    lastCheckedAt: string;
  };
  sync: {
    mode: "read_only_fixture" | string;
    canPreviewImportedPlaces: boolean;
    canOpenGoogleMapsUrl: boolean;
    canWriteBackToGoogle: boolean;
    requiresGoogleOAuthForLiveSync: boolean;
    requiresGoogleMapsApiKeyForPlacesEnrichment: boolean;
    requiresRoutesApiForEta: boolean;
  };
  summary: TripPlacesSummary;
  previewPlaces: TripPlace[];
}

interface MapsRuntimeConfigResponse {
  provider: "google_maps";
  configured: boolean;
  apiKey?: string;
  source: "browser_key" | "explicit_server_key_fallback" | "not_configured";
  warning?: string;
}

interface SetupDraft {
  tripName: string;
  memberName: string;
  memberAge: string;
  googleLink: string;
  aiPlanConfirmed: boolean;
  locationConsentExplained: boolean;
}

interface JoinDraft {
  name: string;
  age: string;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? "http://localhost:3001" : "");
const buildTimeGoogleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";

function loadGoogleMapsSdk(apiKey: string) {
  if (window.google?.maps) {
    return Promise.resolve();
  }

  if (window.__kodiGoogleMapsPromise) {
    return window.__kodiGoogleMapsPromise;
  }

  window.__kodiGoogleMapsPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Google Maps JS failed to load")), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Google Maps JS failed to load")), { once: true });
    document.head.appendChild(script);
  });

  return window.__kodiGoogleMapsPromise;
}

function getMapProviderStatus(apiKey: string, configLoaded: boolean) {
  if (apiKey) {
    return {
      mode: "google-ready" as const,
      label: "Google Maps פעיל",
      detail: "המפה, התנועה, הזום והמעקב מגיעים מ-Google Maps; קודי מוסיף נקודות ושיחה מעליה"
    };
  }

  return {
    mode: "internal-fallback" as const,
    label: configLoaded ? "ממתין ל-Google Maps" : "בודק חיבור Google Maps",
    detail: configLoaded
      ? "חסר GOOGLE_MAPS_BROWSER_API_KEY או VITE_GOOGLE_MAPS_API_KEY; מוצג fallback זמני בלבד, לא מנוע המפה של המוצר"
      : "קודי בודק אם מוגדר מפתח דפדפן בטוח ל-Google Maps"
  };
}

function mapMemberLocations(members: TripMemberLocationResponse["members"]): DemoMember[] {
  return members.map((item) => ({
    id: item.member.id,
    name: item.member.displayName,
    role: item.member.role,
    ageGroup: item.member.ageGroup ?? "adult",
    locationSharing: item.consent.state,
    liveLocation: item.liveLocation
      ? {
          lat: item.liveLocation.lat,
          lng: item.liveLocation.lng,
          label: item.displayLabel ?? "מיקום אחרון",
          updatedMinutesAgo: item.updatedMinutesAgo ?? 0
        }
      : null
  }));
}

function getTripEventLabel(eventType: TripEvent["eventType"]) {
  const labels: Partial<Record<TripEvent["eventType"], string>> = {
    message_created: "הודעה",
    location_updated: "מיקום",
    destination_set: "יעד",
    route_created: "מסלול",
    route_progressed: "התקדמות",
    setup_updated: "קליטה",
    system: "מערכת"
  };

  return labels[eventType] ?? (eventType === "member_joined" ? "הצטרפות" : eventType === "member_left" ? "יציאה" : "מערכת");
}

function getTripEventText(event: TripEvent) {
  switch (event.eventType) {
    case "message_created":
      return `${event.actorName ?? "חבר קבוצה"} שלח/ה הודעה בקבוצה`;
    case "location_updated":
      return `${event.actorName ?? "חבר קבוצה"} עדכן/ה מיקום חי`;
    case "destination_set":
      return `${event.actorName ?? "מנהל"} קבע/ה יעד קבוצתי`;
    case "route_created":
      return `${event.actorName ?? "מנהל"} יצר/ה מסלול קבוצתי`;
    case "route_progressed":
      return `${event.actorName ?? "מנהל"} סימן/ה התקדמות במסלול`;
    case "member_joined":
      return `${event.actorName ?? "משתתף"} הצטרף/ה לקבוצה`;
    case "member_left":
      return `${event.actorName ?? "משתתף"} יצא/ה או הוסר/ה מהקבוצה`;
    case "setup_updated":
      return "הקליטה הראשונית נשמרה";
    default:
      return "קודי הכין את יומן הפעילות";
  }
}

function getUsageAuditSource(summary: string): UsageAuditSource {
  if (summary.includes("via kodi_agent")) {
    return "kodi_agent";
  }

  if (summary.includes("via direct_api")) {
    return "direct_api";
  }

  return "unknown";
}

function buildUsageAuditOverview(events: TripEvent[]): UsageAuditOverview {
  const usageEvents = events.filter(
    (event) => event.eventType === "system" && event.summary.includes("Usage gate authorized")
  );
  const lastUsageEvent = usageEvents[0];

  return {
    totalAuthorizedCalls: usageEvents.length,
    googlePlacesCalls: usageEvents.filter((event) => event.relatedEntityId === "google_places").length,
    googleRoutesCalls: usageEvents.filter((event) => event.relatedEntityId === "google_routes").length,
    kodiAgentCalls: usageEvents.filter((event) => event.summary.includes("via kodi_agent")).length,
    directApiCalls: usageEvents.filter((event) => event.summary.includes("via direct_api")).length,
    lastSource: lastUsageEvent ? getUsageAuditSource(lastUsageEvent.summary) : "unknown",
    lastCapability: lastUsageEvent?.relatedEntityId
  };
}

function getUsageSourceLabel(source: UsageAuditSource) {
  const labels: Record<UsageAuditSource, string> = {
    kodi_agent: "קודי",
    direct_api: "API",
    unknown: "ממתין"
  };

  return labels[source];
}

function getPlaceTypeLabel(type: PlaceType) {
  const labels: Record<PlaceType, string> = {
    lodging: "לינה",
    attraction: "אטרקציה",
    water: "מים",
    food: "אוכל",
    transport: "תחבורה",
    stop: "עצירה",
    unknown: "לא מסווג"
  };

  return labels[type];
}

const placeListFilters: Array<{ value: PlaceListFilter; label: string }> = [
  { value: "route", label: "המסלול שלנו" },
  { value: "nearby", label: "קרוב אלינו" },
  { value: "all", label: "הכל" },
  { value: "lodging", label: "מקומות לינה" },
  { value: "attractions", label: "אטרקציות" }
];

function buildExternalAppShortcuts(place?: TripPlace) {
  const query = encodeURIComponent(place?.name ?? "travel");
  const locationQuery = encodeURIComponent(place?.address ?? place?.name ?? "near me");
  const latLng = typeof place?.lat === "number" && typeof place?.lng === "number" ? `${place.lat},${place.lng}` : null;

  return [
    {
      label: "Google Maps",
      href: latLng
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(latLng)}`
        : `https://www.google.com/maps/search/?api=1&query=${locationQuery}`
    },
    {
      label: "Booking",
      href: `https://www.booking.com/searchresults.html?ss=${query}`
    },
    {
      label: "Airbnb",
      href: `https://www.airbnb.com/s/${query}/homes`
    }
  ];
}

const messageUrlPattern = /(https?:\/\/[^\s<>"']+|waze:\/\/[^\s<>"']+)/g;

function splitTrailingUrlPunctuation(value: string) {
  let url = value;
  let suffix = "";

  while (/[.,;:!?)\]]$/.test(url)) {
    suffix = `${url.slice(-1)}${suffix}`;
    url = url.slice(0, -1);
  }

  return { suffix, url };
}

function getMessageLinkLabel(url: string) {
  if (url.includes("waze.com/ul") || url.startsWith("waze://")) {
    return "פתח ב-Waze";
  }

  if (url.includes("google.com/maps") || url.includes("maps.app.goo.gl")) {
    return "פתח ב-Google Maps";
  }

  return "פתח קישור";
}

function getMessageLinkClass(url: string) {
  if (url.includes("waze.com/ul") || url.startsWith("waze://")) {
    return "message-link waze-link";
  }

  if (url.includes("google.com/maps") || url.includes("maps.app.goo.gl")) {
    return "message-link maps-link";
  }

  return "message-link";
}

function cleanChatDisplayText(text: string) {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/(^|\s)\*{1,3}(?=\S)/g, "$1")
    .replace(/(\S)\*{1,3}(?=\s|$|[.,!?;:)\]])/g, "$1")
    .replace(/\*+\s*$/gm, "")
    .trim();
}

function renderMessageText(text: string) {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  const cleanText = cleanChatDisplayText(text);

  for (const match of cleanText.matchAll(messageUrlPattern)) {
    const rawMatch = match[0];
    const matchIndex = match.index ?? 0;
    const { suffix, url } = splitTrailingUrlPunctuation(rawMatch);

    if (matchIndex > lastIndex) {
      parts.push(cleanText.slice(lastIndex, matchIndex));
    }

    parts.push(
      <a className={getMessageLinkClass(url)} href={url} key={`${url}-${matchIndex}`} rel="noopener noreferrer" target="_blank">
        {getMessageLinkLabel(url)}
      </a>
    );

    if (suffix) {
      parts.push(suffix);
    }

    lastIndex = matchIndex + rawMatch.length;
  }

  if (lastIndex < cleanText.length) {
    parts.push(cleanText.slice(lastIndex));
  }

  return parts.length > 0 ? parts : cleanText;
}

function shouldSpeakKodiReply(text: string) {
  const normalized = text.toLowerCase();

  return [
    "בקול",
    "בקול רם",
    "בדיבור",
    "תקריא",
    "תקריאי",
    "תקריא לי",
    "תקרא בקול",
    "דבר",
    "דברי",
    "תספר בקול",
    "להקריא",
    "אני רוצה לשמוע",
    "שמע"
  ].some((fragment) => normalized.includes(fragment));
}

function isCurrentLocationQuestion(text: string) {
  const normalizedText = text.toLowerCase();
  return (
    normalizedText.includes("where am i") ||
    normalizedText.includes("current location") ||
    ["איפה אני", "איפה אני עכשיו", "מיקום נוכחי", "אתה רואה אותי", "איפה אנחנו"].some((fragment) =>
      text.includes(fragment)
    )
  );
}

function buildSpeechText(text: string) {
  return text.replace(messageUrlPattern, "").replace(/\s+/g, " ").trim();
}

function getKodiHebrewVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return undefined;
  }

  const voices = window.speechSynthesis.getVoices();
  const hebrewVoices = voices.filter((voice) => voice.lang.toLowerCase().startsWith("he"));
  const maleVoiceHints = ["asaf", "david", "daniel", "yoav", "hebrew male", "male"];
  const friendlyVoiceHints = ["google", "microsoft", "natural", "online"];

  return (
    hebrewVoices.find((voice) => maleVoiceHints.some((hint) => voice.name.toLowerCase().includes(hint))) ??
    hebrewVoices.find((voice) => friendlyVoiceHints.some((hint) => voice.name.toLowerCase().includes(hint))) ??
    hebrewVoices[0] ??
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en") && maleVoiceHints.some((hint) => voice.name.toLowerCase().includes(hint))) ??
    voices[0]
  );
}

function buildKodiFallbackReply(messages: ChatMessage[], selectedPlace?: TripPlace) {
  const lastText = messages.at(-1)?.text.trim() ?? "";
  const normalizedLastText = lastText.replace(/[?!.,\s]/g, "").toLowerCase();
  if (["קודי", "kodi", "codex", "קודקס"].includes(normalizedLastText)) {
    return "אני כאן. תגידו לי מה צריך עכשיו: ניווט, נקודה במסלול, מקום קרוב, הסבר על מה שרואים, או סידור מחדש של המסלול.";
  }

  const recentText = messages
    .slice(-4)
    .map((message) => message.text)
    .join(" ");
  const selected = selectedPlace?.name ?? "המלון הקרוב";

  if (recentText.includes("ספר") || recentText.includes("רואים") || recentText.includes("מזרקה")) {
    return "אני יכול להיות רגע מדריך מקומי. לפי ההקשר אני צריך לזהות בדיוק איפה אתם או איזו נקודה נבחרה. אם זו מזרקה, אספר בקצרה מה רואים, למה זה מעניין, ואתאים את ההסבר לילדים בלי להמציא עובדות שאני לא בטוח בהן.";
  }

  if (recentText.includes("מסלול") || recentText.includes("שעה פנויה") || recentText.includes("מזרקות")) {
    return "אני יכול לבנות מסלול חדש, אבל קודם צריך לאפיין אותו. כמה זמן יש לכם, האם זה ברגל או ברכב, מה דרגת הקושי הרצויה, מי בקבוצה עכשיו, ומה מעניין אתכם: מים, אוכל, היסטוריה, ילדים או משהו רגוע ליד המלון?";
  }

  if (recentText.includes("גלידה") || recentText.includes("לישון") || recentText.includes("מלון")) {
    return `אפשר. אחפש סביב ${selected} מקום קרוב ונוח, עם כמה שפחות סטייה והליכה קצרה. אם יש כמה אפשרויות טובות, אבחר את זו שהכי מתאימה למה שביקשתם ואציע קישור ניווט ברור.`;
  }

  if (recentText.includes("איפה") || recentText.includes("כולם")) {
    return "אני מסתכל על ההקשר של הקבוצה. כשנחבר מיקום חי, אוכל להגיד מי קרוב למי ולהציע נקודת מפגש נוחה בלי לחשוף מיקום של מי שלא אישר שיתוף.";
  }

  return "אני כאן. אפשר לשאול אותי על המסלול, מקום בדרך, עלויות, אוכל, ניווט, מזג אוויר או מה כדאי לעשות עכשיו.";
}

function shouldAttachSelectedPlaceToAgent(text: string) {
  const normalized = text.trim().toLowerCase();

  return [
    "הנקודה",
    "המקום",
    "הזה",
    "הזו",
    "אותו",
    "אותה",
    "שבחרתי",
    "שמסומן",
    "במפה",
    "וויז",
    "waze",
    "google maps",
    "פתח",
    "נווט",
    "ניווט",
    "מפה"
  ].some((term) => normalized.includes(term));
}

function shouldWakeKodi(text: string, currentMessages: ChatMessage[] = []) {
  const explicitCall = /\b(kodi|codex)\b/i.test(text) || text.includes("קודי") || text.includes("קודקס");
  if (explicitCall) {
    return true;
  }

  const naturalQuestionOrTask = [
    "?",
    "מה",
    "כמה",
    "איפה",
    "איך",
    "מתי",
    "לאן",
    "האם",
    "יש",
    "כדאי",
    "אפשר",
    "תבדוק",
    "תחפש",
    "תמצא",
    "תמליץ",
    "תסביר",
    "ספר",
    "שים",
    "פתח",
    "קח אותנו",
    "תארגן",
    "תכנן",
    "מסלול",
    "מלון",
    "אטרקציה",
    "חוף",
    "מסעדה",
    "טברנה",
    "שנורקל",
    "משקפת",
    "משקפות",
    "מזומן",
    "אשראי",
    "יורו",
    "מזג",
    "שקיעה",
    "Waze",
    "waze",
    "Google Maps"
  ].some((term) => text.includes(term));

  if (naturalQuestionOrTask) {
    return true;
  }

  const recentMessages = currentMessages.slice(-4);
  const kodiWasRecentlyActive = recentMessages.some((message) => message.author === "קודי" || message.source === "agent");
  if (!kodiWasRecentlyActive) {
    return false;
  }

  return [
    "?",
    "מה",
    "כמה",
    "איפה",
    "איך",
    "מתי",
    "לאן",
    "האם",
    "יש",
    "אפשר",
    "תבדוק",
    "תחפש",
    "תמצא",
    "תמליץ",
    "תסביר",
    "ספר",
    "שים",
    "פתח",
    "קח אותנו"
  ].some((term) => text.includes(term));
}

function getMapPosition(index: number, total: number) {
  const angle = total > 0 ? (index / total) * Math.PI * 2 : 0;
  const radius = 20 + (index % 3) * 7;

  return {
    left: `${50 + Math.cos(angle) * radius}%`,
    top: `${50 + Math.sin(angle) * radius}%`
  };
}

function getDistanceKm(first: { lat: number; lng: number }, second: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDelta = toRadians(second.lat - first.lat);
  const lngDelta = toRadians(second.lng - first.lng);
  const firstLat = toRadians(first.lat);
  const secondLat = toRadians(second.lat);
  const haversine =
    Math.sin(latDelta / 2) ** 2 + Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lngDelta / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getPlaceDistanceKm(place: TripPlace, anchor?: { lat: number; lng: number } | null) {
  if (!anchor || typeof place.lat !== "number" || typeof place.lng !== "number") {
    return null;
  }

  return getDistanceKm(anchor, { lat: place.lat, lng: place.lng });
}

function formatDistanceKm(distanceKm: number | null) {
  if (distanceKm === null) {
    return null;
  }

  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} מ׳` : `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} ק״מ`;
}

function getPlaceCardSummary(place: TripPlace) {
  const cleanedNote = place.note?.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
  const summary = cleanedNote || place.address || "אין עדיין הסבר שמור לנקודה הזו.";

  return summary.length > 120 ? `${summary.slice(0, 117).trim()}...` : summary;
}

function getApproximateRadiusCorners(center: { lat: number; lng: number }, radiusKm: number) {
  const latDelta = radiusKm / 111;
  const lngScale = Math.max(Math.cos((center.lat * Math.PI) / 180), 0.2);
  const lngDelta = radiusKm / (111 * lngScale);

  return {
    southWest: { lat: center.lat - latDelta, lng: center.lng - lngDelta },
    northEast: { lat: center.lat + latDelta, lng: center.lng + lngDelta }
  };
}

function getInitialJoinToken() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("join") ?? "";
}

function getAgeGroupFromDraft(ageDraft: string) {
  const age = Number(ageDraft);
  if (!Number.isFinite(age)) {
    return "adult";
  }

  if (age < 13) {
    return "child";
  }

  if (age < 18) {
    return "teen";
  }

  if (age >= 65) {
    return "senior";
  }

  return "adult";
}

export function App() {
  const initialJoinToken = getInitialJoinToken();
  const [showActivation, setShowActivation] = useState(!initialJoinToken && !getLocalSetupCompleted());
  const [showJoinFlow, setShowJoinFlow] = useState(Boolean(initialJoinToken));
  const [activationStep, setActivationStep] = useState<ActivationStep>("welcome");
  const [setupState, setSetupState] = useState<TripSetupStateResponse | null>(null);
  const [googleSourcePreview, setGoogleSourcePreview] = useState<GoogleSourcePreviewResponse | null>(null);
  const [setupSaveState, setSetupSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [setupSaveError, setSetupSaveError] = useState("");
  const [setupDraft, setSetupDraft] = useState<SetupDraft>({
    tripName: "",
    memberName: "",
    memberAge: "",
    googleLink: "",
    aiPlanConfirmed: false,
    locationConsentExplained: false
  });
  const [joinDraft, setJoinDraft] = useState<JoinDraft>({
    name: "",
    age: ""
  });
  const [inviteCopyState, setInviteCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [inviteShareState, setInviteShareState] = useState<"idle" | "sharing" | "shared" | "copied" | "error">("idle");
  const [memberActionState, setMemberActionState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [mapSwitchState, setMapSwitchState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [mapSwitchMessage, setMapSwitchMessage] = useState("");
  const [mapSwitchDraft, setMapSwitchDraft] = useState({
    name: "",
    googleLink: ""
  });
  const initialPlaces = useMemo(() => applyLocalPlaceRemovals(demoPlaces), []);
  const [summary, setSummary] = useState<TripPlacesSummary>(() =>
    initialPlaces.length === demoPlaces.length
      ? {
          total: demoTripSummary.totalPlaces,
          lodgingCount: demoTripSummary.lodgingCount,
          waterCount: demoTripSummary.waterCount,
          byType: buildTripSummaryFromPlaces(initialPlaces).byType
        }
      : buildTripSummaryFromPlaces(initialPlaces)
  );
  const [places, setPlaces] = useState<TripPlace[]>(initialPlaces);
  const [selectedPlaceId, setSelectedPlaceId] = useState(initialPlaces[0]?.id ?? "");
  const [placeListFilter, setPlaceListFilter] = useState<PlaceListFilter>("route");
  const [expandedPlaceId, setExpandedPlaceId] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "fallback">("loading");
  const [navigationState, setNavigationState] = useState<"idle" | "opening" | "error">("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(() => sanitizeChatMessages(demoMessages));
  const [tripEvents, setTripEvents] = useState<TripEvent[]>([]);
  const [eventRealtimeState, setEventRealtimeState] = useState<"idle" | "live" | "error">("idle");
  const [eventLogDriver, setEventLogDriver] = useState<"file" | "supabase" | "unknown">("unknown");
  const [members, setMembers] = useState<DemoMember[]>(normalizeTripMembers(demoMembers as DemoMember[]));
  const [activeMemberId, setActiveMemberId] = useState("mom");
  const [draft, setDraft] = useState("");
  const [speechState, setSpeechState] = useState<"idle" | "listening" | "unsupported" | "error">("idle");
  const [isKodiThinking, setIsKodiThinking] = useState(false);
  const [speechOutputState, setSpeechOutputState] = useState<"idle" | "preparing" | "speaking" | "unsupported" | "error">("idle");
  const [voiceConversationActive, setVoiceConversationActive] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [userShortcuts, setUserShortcuts] = useState<UserShortcut[]>([]);
  const [shortcutLabelDraft, setShortcutLabelDraft] = useState("");
  const [shortcutUrlDraft, setShortcutUrlDraft] = useState("");
  const [currentLocation, setCurrentLocation] = useState<CurrentLocationState | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "requesting" | "enabled" | "error">("idle");
  const [locationSyncState, setLocationSyncState] = useState<"idle" | "synced" | "blocked" | "error">("idle");
  const [memberRealtimeState, setMemberRealtimeState] = useState<"idle" | "live" | "error">("idle");
  const [chatRealtimeState, setChatRealtimeState] = useState<"idle" | "live" | "error">("idle");
  const [actionApprovalState, setActionApprovalState] = useState<"idle" | "checking" | "approved" | "blocked" | "error">(
    "idle"
  );
  const [groupDestination, setGroupDestination] = useState<GroupDestination | null>(null);
  const [destinationRealtimeState, setDestinationRealtimeState] = useState<"idle" | "live" | "error">("idle");
  const [groupRoute, setGroupRoute] = useState<GroupRoute | null>(null);
  const [routeRealtimeState, setRouteRealtimeState] = useState<"idle" | "live" | "error">("idle");
  const [routeApprovalState, setRouteApprovalState] = useState<"idle" | "checking" | "approved" | "blocked" | "error">(
    "idle"
  );
  const [activeRouteStopIndex, setActiveRouteStopIndex] = useState(0);
  const [secondaryMenuOpen, setSecondaryMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installState, setInstallState] = useState<"idle" | "ready" | "installed" | "unavailable">("idle");
  const [googleMapsApiKey, setGoogleMapsApiKey] = useState(buildTimeGoogleMapsApiKey);
  const [mapsConfigLoaded, setMapsConfigLoaded] = useState(Boolean(buildTimeGoogleMapsApiKey));
  const googleMapElementRef = useRef<HTMLDivElement | null>(null);
  const googleMapInstanceRef = useRef<any | null>(null);
  const googleMapMarkersRef = useRef<any[]>([]);
  const googleMapFitSignatureRef = useRef("");
  const locationWatchIdRef = useRef<number | null>(null);
  const speechRecognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceTranscriptRef = useRef("");
  const voiceShouldSendRef = useRef(false);
  const voiceInputModeRef = useRef<"push" | "conversation">("push");
  const voiceConversationActiveRef = useRef(false);
  const isKodiThinkingRef = useRef(false);
  const speechOutputStateRef = useRef<"idle" | "preparing" | "speaking" | "unsupported" | "error">("idle");
  const speechAudioRef = useRef<HTMLAudioElement | null>(null);
  const speechAudioUrlRef = useRef<string | null>(null);
  const speechAudioUrlIsCachedRef = useRef(false);
  const speechAudioCacheRef = useRef<Map<string, string>>(new Map());
  const speechAudioPendingRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const speechRequestTokenRef = useRef(0);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    voiceConversationActiveRef.current = voiceConversationActive;
  }, [voiceConversationActive]);

  useEffect(() => {
    isKodiThinkingRef.current = isKodiThinking;
  }, [isKodiThinking]);

  useEffect(() => {
    speechOutputStateRef.current = speechOutputState;
  }, [speechOutputState]);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.abort();
      speechRecognitionRef.current = null;
      window.speechSynthesis?.cancel();
      speechAudioRef.current?.pause();
      speechAudioCacheRef.current.forEach((audioUrl) => URL.revokeObjectURL(audioUrl));
      speechAudioCacheRef.current.clear();
      speechAudioPendingRef.current.clear();
      if (speechAudioUrlRef.current && !speechAudioUrlIsCachedRef.current) {
        URL.revokeObjectURL(speechAudioUrlRef.current);
      }
      speechAudioUrlRef.current = null;
      speechAudioUrlIsCachedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    if (standalone) {
      setInstallState("installed");
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setInstallState("ready");
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setInstallState("installed");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    setInstallState((current) => (current === "idle" ? "unavailable" : current));

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);
  const lastMessageCountRef = useRef(0);
  const shouldStickToLatestMessageRef = useRef(true);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const hasNewMessage = messages.length > lastMessageCountRef.current;
    const shouldScrollToLatest = hasNewMessage || shouldStickToLatestMessageRef.current;
    lastMessageCountRef.current = messages.length;

    if (!shouldScrollToLatest) {
      return;
    }

    window.requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }, [messages, isKodiThinking]);

  function updateMessageScrollIntent() {
    const container = messagesContainerRef.current;
    if (!container) {
      return;
    }

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    shouldStickToLatestMessageRef.current = distanceFromBottom < 80;
  }

  function applyTripEvents(data: TripEventsResponse) {
    setTripEvents(data.events);
    setEventLogDriver(data.eventLog.driver);
    setEventRealtimeState("live");
  }

  async function fetchTripEvents() {
    const response = await fetch(`${apiBaseUrl}/api/trips/demo/events`);
    if (!response.ok) {
      throw new Error(`Events API failed with ${response.status}`);
    }

    return (await response.json()) as TripEventsResponse;
  }

  async function refreshTripEvents() {
    try {
      applyTripEvents(await fetchTripEvents());
    } catch {
      setEventRealtimeState("error");
    }
  }

  function applyGroupRoute(route: GroupRoute | null) {
    setGroupRoute(route);
    setActiveRouteStopIndex(route?.activeStopIndex ?? 0);
    setRouteRealtimeState("live");
  }

  function applyGroupDestination(destination: GroupDestination | null) {
    setGroupDestination(destination);
    setDestinationRealtimeState("live");
  }

  useEffect(() => {
    let ignore = false;

    async function fetchMapsRuntimeConfig() {
      if (buildTimeGoogleMapsApiKey) {
        return;
      }

      try {
        const response = await fetch(`${apiBaseUrl}/api/config/maps`);
        if (!response.ok) {
          throw new Error(`Maps config failed with ${response.status}`);
        }

        const data = (await response.json()) as MapsRuntimeConfigResponse;
        if (!ignore) {
          setGoogleMapsApiKey(data.apiKey?.trim() ?? "");
          setMapsConfigLoaded(true);
        }
      } catch {
        if (!ignore) {
          setMapsConfigLoaded(true);
        }
      }
    }

    void fetchMapsRuntimeConfig();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    async function loadSetupState() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/trips/demo/setup`);
        if (!response.ok) {
          throw new Error(`Setup API failed with ${response.status}`);
        }

        const data = (await response.json()) as TripSetupStateResponse;
        if (!ignore) {
          setSetupState(data);
          const savedSetup = data.setupSummary;
          if (savedSetup) {
            setSetupDraft((draft) => ({
              ...draft,
              tripName: savedSetup.tripName,
              memberName: savedSetup.firstMemberName,
              memberAge:
                typeof savedSetup.firstMemberAge === "number"
                  ? String(savedSetup.firstMemberAge)
                  : draft.memberAge,
              googleLink: savedSetup.googleLink
            }));
          }
          if (data.setupCompleted && !initialJoinToken) {
            rememberLocalSetupCompleted();
            setShowActivation(false);
          }
        }
      } catch {
        if (!ignore) {
          setSetupState({
            tripGroupId: "group_family_greece_demo",
            currentStep: "welcome",
            setupCompleted: false,
            aiPlanMode: "limited",
            setupSummary: undefined,
            googleSource: {
              state: "demo_link_ready",
              sourceType: "google_maps_place_list",
              displayName: "Google Maps Place List viewing link",
              importedPlacesCount: demoTripSummary.totalPlaces
            },
            readiness: {
              hasOwner: true,
              hasMembers: true,
              hasGoogleSource: true,
              hasLocationConsentExplained: true,
              hasAiPlanExplained: true
            },
            steps: [
              {
                id: "welcome",
                title: "ברוכים הבאים",
                status: "current",
                description: "קודי מסביר איך מפעילים אותו בתוך שיחת המשפחה."
              },
              {
                id: "ai_plan",
                title: "חשבון והפעלה",
                status: "pending",
                description: "המערכת פועלת דרך חשבון מנהל הטיול ותקציב API מרכזי."
              },
              {
                id: "members",
                title: "חברי הקבוצה",
                status: "pending",
                description: "הוספת שם, גיל/קבוצת גיל, תפקיד והרשאות."
              },
              {
                id: "google_source",
                title: "חיבור Google",
                status: "pending",
                description: "הדבקת קישור צפייה של Google Maps Place List."
              },
              {
                id: "location",
                title: "מיקום והרשאות",
                status: "pending",
                description: "מיקום חי במפה ושיתוף מיקום רק בהסכמה מפורשת."
              }
            ],
            kodiWelcomeMessage:
              "אני קודי, מלווה הטיול של הקבוצה. אני עוזר לחבר את Google, להוסיף את המשפחה, להסביר הרשאות מיקום ולהכניס אתכם למפה ולשיחה."
          });
        }
      }
    }

    async function loadGoogleSourcePreview() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/trips/demo/google-source`);
        if (!response.ok) {
          throw new Error(`Google source API failed with ${response.status}`);
        }

        const data = (await response.json()) as GoogleSourcePreviewResponse;
        if (!ignore) {
          setGoogleSourcePreview(data);
        }
      } catch {
        if (!ignore) {
          setGoogleSourcePreview(null);
        }
      }
    }

    async function loadTripState() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/trips/demo/state`);
        if (!response.ok) {
          throw new Error(`Trip state API failed with ${response.status}`);
        }

        const data = (await response.json()) as TripStateResponse;
        if (ignore) {
          return;
        }

        const visibleTripPlaces = applyLocalPlaceRemovals(data.places);
        setSummary(
          visibleTripPlaces.length === data.places.length ? data.summary : buildTripSummaryFromPlaces(visibleTripPlaces)
        );
        setPlaces(visibleTripPlaces);
        setSelectedPlaceId(visibleTripPlaces[0]?.id ?? "");
        setMembers(normalizeTripMembers(mapMemberLocations(data.members), setupDraft.memberName));
        setGroupDestination(data.groupDestination ?? null);
        setGroupRoute(data.groupRoute ?? null);
        setActiveRouteStopIndex(data.groupRoute?.activeStopIndex ?? 0);
        setLoadState("ready");
      } catch {
        if (!ignore) {
          setLoadState("fallback");
          void loadMembers();
        }
      }
    }

    async function loadMembers() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/trips/demo/members`);
        if (!response.ok) {
          throw new Error(`Members API failed with ${response.status}`);
        }

        const data = (await response.json()) as TripMemberLocationResponse;
        if (ignore) {
          return;
        }

        setMembers(
          normalizeTripMembers(
            data.members.map((item) => ({
              id: item.member.id,
              name: item.member.displayName,
              role: item.member.role,
              ageGroup: item.member.ageGroup ?? "adult",
              locationSharing: item.consent.state,
              liveLocation: item.liveLocation
                ? {
                    lat: item.liveLocation.lat,
                    lng: item.liveLocation.lng,
                    label: item.displayLabel ?? "מיקום אחרון",
                    updatedMinutesAgo: item.updatedMinutesAgo ?? 0
                  }
                : null
            })),
            setupDraft.memberName
          )
        );
      } catch {
        if (!ignore) {
          setMembers(normalizeTripMembers(demoMembers as DemoMember[], setupDraft.memberName));
        }
      }
    }

    async function loadMessages() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/trips/demo/messages`);
        if (!response.ok) {
          throw new Error(`Messages API failed with ${response.status}`);
        }

        const data = (await response.json()) as TripMessagesResponse;
        if (!ignore) {
          setMessages((currentMessages) => mergeChatMessages(currentMessages, data.messages));
        }
      } catch {
        if (!ignore) {
          setChatRealtimeState("error");
        }
      }
    }

    async function loadTripEvents() {
      try {
        const data = await fetchTripEvents();
        if (!ignore) {
          applyTripEvents(data);
        }
      } catch {
        if (!ignore) {
          setEventRealtimeState("error");
        }
      }
    }

    void loadSetupState();
    void loadGoogleSourcePreview();
    void loadTripState();
    void loadMessages();
    void loadTripEvents();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    let intervalId: number | undefined;
    let eventSource: EventSource | undefined;

    async function pollGroupMessages() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/trips/demo/messages`);
        if (!response.ok) {
          throw new Error(`Messages polling failed with ${response.status}`);
        }

        const data = (await response.json()) as TripMessagesResponse;
        if (ignore) {
          return;
        }

        setMessages((currentMessages) => mergeChatMessages(currentMessages, data.messages));
        setChatRealtimeState("live");
      } catch {
        if (!ignore) {
          setChatRealtimeState("error");
        }
      }
    }

    function startPollingFallback() {
      if (intervalId !== undefined) {
        return;
      }

      void pollGroupMessages();
      intervalId = window.setInterval(pollGroupMessages, 4000);
    }

    if ("EventSource" in window) {
      eventSource = new EventSource(`${apiBaseUrl}/api/trips/demo/messages/stream`);
      eventSource.addEventListener("trip-messages", (event) => {
        try {
          const data = JSON.parse(event.data) as TripMessagesResponse;
          if (!ignore && Array.isArray(data.messages)) {
            setMessages((currentMessages) => mergeChatMessages(currentMessages, data.messages));
            setChatRealtimeState("live");
          }
        } catch {
          if (!ignore) {
            setChatRealtimeState("error");
          }
        }
      });
      eventSource.onerror = () => {
        if (ignore) {
          return;
        }

        eventSource?.close();
        eventSource = undefined;
        startPollingFallback();
      };
    } else {
      startPollingFallback();
    }

    return () => {
      ignore = true;
      eventSource?.close();
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    let intervalId: number | undefined;
    let eventSource: EventSource | undefined;

    async function pollGroupDestination() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/trips/demo/group-destination`);
        if (!response.ok) {
          throw new Error(`Group destination polling failed with ${response.status}`);
        }

        const data = (await response.json()) as GroupDestinationResponse;
        if (!ignore) {
          applyGroupDestination(data.destination ?? null);
        }
      } catch {
        if (!ignore) {
          setDestinationRealtimeState("error");
        }
      }
    }

    function startPollingFallback() {
      if (intervalId !== undefined) {
        return;
      }

      void pollGroupDestination();
      intervalId = window.setInterval(pollGroupDestination, 5000);
    }

    if ("EventSource" in window) {
      eventSource = new EventSource(`${apiBaseUrl}/api/trips/demo/group-destination/stream`);
      eventSource.addEventListener("group-destination", (event) => {
        try {
          const data = JSON.parse(event.data) as GroupDestinationResponse;
          if (!ignore && "destination" in data) {
            applyGroupDestination(data.destination ?? null);
          }
        } catch {
          if (!ignore) {
            setDestinationRealtimeState("error");
          }
        }
      });
      eventSource.onerror = () => {
        if (ignore) {
          return;
        }

        eventSource?.close();
        eventSource = undefined;
        startPollingFallback();
      };
    } else {
      startPollingFallback();
    }

    return () => {
      ignore = true;
      eventSource?.close();
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    let intervalId: number | undefined;
    let eventSource: EventSource | undefined;

    async function pollTripEvents() {
      try {
        const data = await fetchTripEvents();
        if (!ignore) {
          applyTripEvents(data);
        }
      } catch {
        if (!ignore) {
          setEventRealtimeState("error");
        }
      }
    }

    function startPollingFallback() {
      if (intervalId !== undefined) {
        return;
      }

      void pollTripEvents();
      intervalId = window.setInterval(pollTripEvents, 5000);
    }

    if ("EventSource" in window) {
      eventSource = new EventSource(`${apiBaseUrl}/api/trips/demo/events/stream`);
      eventSource.addEventListener("trip-events", (event) => {
        try {
          const data = JSON.parse(event.data) as TripEventsResponse;
          if (!ignore && Array.isArray(data.events)) {
            applyTripEvents(data);
          }
        } catch {
          if (!ignore) {
            setEventRealtimeState("error");
          }
        }
      });
      eventSource.onerror = () => {
        if (ignore) {
          return;
        }

        eventSource?.close();
        eventSource = undefined;
        startPollingFallback();
      };
    } else {
      startPollingFallback();
    }

    return () => {
      ignore = true;
      eventSource?.close();
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    let intervalId: number | undefined;
    let eventSource: EventSource | undefined;

    async function pollMemberLocations() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/trips/demo/members`);
        if (!response.ok) {
          throw new Error(`Members polling failed with ${response.status}`);
        }

        const data = (await response.json()) as TripMemberLocationResponse;
        if (ignore) {
          return;
        }

        setMembers(normalizeTripMembers(mapMemberLocations(data.members), setupDraft.memberName));
        setMemberRealtimeState("live");
      } catch {
        if (!ignore) {
          setMemberRealtimeState("error");
        }
      }
    }

    function startPollingFallback() {
      if (intervalId !== undefined) {
        return;
      }

      void pollMemberLocations();
      intervalId = window.setInterval(pollMemberLocations, 5000);
    }

    if ("EventSource" in window) {
      eventSource = new EventSource(`${apiBaseUrl}/api/trips/demo/members/stream`);
      eventSource.addEventListener("trip-members", (event) => {
        try {
          const data = JSON.parse(event.data) as TripMemberLocationResponse;
          if (!ignore && Array.isArray(data.members)) {
            setMembers(normalizeTripMembers(mapMemberLocations(data.members), setupDraft.memberName));
            setMemberRealtimeState("live");
          }
        } catch {
          if (!ignore) {
            setMemberRealtimeState("error");
          }
        }
      });
      eventSource.onerror = () => {
        if (ignore) {
          return;
        }

        eventSource?.close();
        eventSource = undefined;
        startPollingFallback();
      };
    } else {
      startPollingFallback();
    }

    return () => {
      ignore = true;
      eventSource?.close();
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    let intervalId: number | undefined;
    let eventSource: EventSource | undefined;

    async function pollGroupRoute() {
      try {
        const response = await fetch(`${apiBaseUrl}/api/trips/demo/group-route`);
        if (!response.ok) {
          throw new Error(`Group route polling failed with ${response.status}`);
        }

        const data = (await response.json()) as GroupRouteResponse;
        if (!ignore) {
          applyGroupRoute(data.route ?? null);
        }
      } catch {
        if (!ignore) {
          setRouteRealtimeState("error");
        }
      }
    }

    function startPollingFallback() {
      if (intervalId !== undefined) {
        return;
      }

      void pollGroupRoute();
      intervalId = window.setInterval(pollGroupRoute, 5000);
    }

    if ("EventSource" in window) {
      eventSource = new EventSource(`${apiBaseUrl}/api/trips/demo/group-route/stream`);
      eventSource.addEventListener("group-route", (event) => {
        try {
          const data = JSON.parse(event.data) as GroupRouteResponse;
          if (!ignore && "route" in data) {
            applyGroupRoute(data.route ?? null);
          }
        } catch {
          if (!ignore) {
            setRouteRealtimeState("error");
          }
        }
      });
      eventSource.onerror = () => {
        if (ignore) {
          return;
        }

        eventSource?.close();
        eventSource = undefined;
        startPollingFallback();
      };
    } else {
      startPollingFallback();
    }

    return () => {
      ignore = true;
      eventSource?.close();
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  const activeMember = members.find((member) => member.id === activeMemberId) ?? members[0] ?? {
    id: "mom",
    name: "מנהל הטיול",
    role: "owner",
    ageGroup: "adult",
    locationSharing: "enabled",
    liveLocation: null
  };
  const managerMember = members.find((member) => member.role === "owner" || member.role === "admin") ?? activeMember;
  const mapAnchorLocation = currentLocation ?? managerMember.liveLocation;

  const visiblePlaces = useMemo(() => {
    const priority: Record<PlaceType, number> = {
      lodging: 0,
      water: 1,
      attraction: 2,
      food: 3,
      transport: 4,
      stop: 5,
      unknown: 6
    };

    if (mapAnchorLocation) {
      const placesWithDistance = places
        .filter((place) => typeof place.lat === "number" && typeof place.lng === "number")
        .map((place) => ({
          place,
          distanceKm: getDistanceKm(mapAnchorLocation, { lat: Number(place.lat), lng: Number(place.lng) })
        }))
        .sort((first, second) => first.distanceKm - second.distanceKm);
      const nearbyPlaces = placesWithDistance.filter((item) => item.distanceKm <= DEFAULT_NEARBY_MAP_RADIUS_KM);

      return (nearbyPlaces.length > 0 ? nearbyPlaces : placesWithDistance)
        .slice(0, DEFAULT_VISIBLE_PLACE_LIMIT)
        .map((item) => item.place);
    }

    return [...places]
      .sort((first, second) => priority[first.type] - priority[second.type])
      .slice(0, DEFAULT_VISIBLE_PLACE_LIMIT);
  }, [mapAnchorLocation, places]);
  const mapPlaces = useMemo(
    () => visiblePlaces.filter((place) => typeof place.lat === "number" && typeof place.lng === "number"),
    [visiblePlaces]
  );
  const menuPlaces = useMemo(() => {
    const getSourceOrder = (place: TripPlace) =>
      typeof place.sourceIndex === "number" ? place.sourceIndex : Number.MAX_SAFE_INTEGER;
    const hasCoordinates = (place: TripPlace) => typeof place.lat === "number" && typeof place.lng === "number";
    const isAttractionLike = (place: TripPlace) => !["lodging", "transport"].includes(place.type);
    const compareByTripOrder = (first: TripPlace, second: TripPlace) =>
      getSourceOrder(first) - getSourceOrder(second) || first.name.localeCompare(second.name, "he");

    if (placeListFilter === "nearby" && mapAnchorLocation) {
      return places
        .filter(hasCoordinates)
        .map((place) => ({
          place,
          distanceKm: getPlaceDistanceKm(place, mapAnchorLocation) ?? Number.MAX_SAFE_INTEGER
        }))
        .sort((first, second) => first.distanceKm - second.distanceKm || compareByTripOrder(first.place, second.place))
        .map((item) => item.place);
    }

    const filteredPlaces =
      placeListFilter === "lodging"
        ? places.filter((place) => place.type === "lodging")
        : placeListFilter === "attractions"
          ? places.filter(isAttractionLike)
          : places;

    return [...filteredPlaces].sort((first, second) => {
      const firstHasCoordinates = hasCoordinates(first);
      const secondHasCoordinates = hasCoordinates(second);
      if (firstHasCoordinates !== secondHasCoordinates) {
        return firstHasCoordinates ? -1 : 1;
      }

      return compareByTripOrder(first, second);
    });
  }, [mapAnchorLocation, placeListFilter, places]);

  useEffect(() => {
    if (places.length > 0 && !places.some((place) => place.id === selectedPlaceId)) {
      setSelectedPlaceId(places[0].id);
    }
  }, [places, selectedPlaceId]);

  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? visiblePlaces[0] ?? places[0];
  const canNavigate = typeof selectedPlace?.lat === "number" && typeof selectedPlace?.lng === "number";
  const externalShortcuts = buildExternalAppShortcuts(selectedPlace);
  const mapProviderStatus = getMapProviderStatus(googleMapsApiKey, mapsConfigLoaded);
  const mapFocusSummary =
    mapPlaces.length > 0
      ? `מפת הטיול · ${mapPlaces.length} נקודות עם מיקום · המיקום שלך מוצג מעליה`
      : "מפת הטיול נטענת · נקודות בלי קואורדינטות זמינות ברשימה";
  const tripInviteUrl =
    typeof window === "undefined"
      ? "https://kodi-travel-companion.onrender.com?join=group_family_greece_demo"
      : `${window.location.origin}${window.location.pathname}?join=group_family_greece_demo`;
  const visibleMembers = useMemo(
    () => members.filter((member) => member.locationSharing === "enabled" && member.liveLocation),
    [members]
  );
  const mapFitSignature = useMemo(
    () =>
      [
        currentLocation ? "current-location-on" : "current-location-off",
        mapAnchorLocation ? `${mapAnchorLocation.lat}:${mapAnchorLocation.lng}:${DEFAULT_NEARBY_MAP_RADIUS_KM}` : "no-anchor",
        mapPlaces.map((place) => `${place.id}:${place.lat}:${place.lng}`).join("|")
      ].join("::"),
    [currentLocation, mapAnchorLocation, mapPlaces]
  );
  const recentTripEvents = tripEvents.slice(0, 3);
  const usageAuditOverview = useMemo(() => buildUsageAuditOverview(tripEvents), [tripEvents]);

  useEffect(() => {
    if (!googleMapsApiKey || !googleMapElementRef.current) {
      return;
    }

    const fallbackCenter =
      mapAnchorLocation ??
      (typeof selectedPlace?.lat === "number" && typeof selectedPlace.lng === "number"
        ? { lat: selectedPlace.lat, lng: selectedPlace.lng }
        : mapPlaces[0]);

    if (!fallbackCenter) {
      return;
    }

    const center = { lat: Number(fallbackCenter.lat), lng: Number(fallbackCenter.lng) };
    let cancelled = false;
    const mapElement = googleMapElementRef.current;
    const nextMarkers: any[] = [];

    async function renderGoogleMap() {
      try {
        await loadGoogleMapsSdk(googleMapsApiKey);
        if (cancelled || !window.google?.maps) {
          return;
        }

        const google = window.google;
        const existingMap = googleMapInstanceRef.current;
        const map =
          existingMap ??
          new google.maps.Map(mapElement, {
            center,
            zoom: mapAnchorLocation ? 10 : 9,
            clickableIcons: true,
            fullscreenControl: true,
            mapTypeControl: false,
            streetViewControl: true
        });
        googleMapInstanceRef.current = map;

        googleMapMarkersRef.current.forEach((marker) => marker.setMap?.(null));
        googleMapMarkersRef.current = [];

        const bounds = new google.maps.LatLngBounds();
        let hasBounds = false;

        mapPlaces.forEach((place) => {
          if (typeof place.lat !== "number" || typeof place.lng !== "number") {
            return;
          }

          const position = { lat: place.lat, lng: place.lng };
          const marker = new google.maps.Marker({
            map,
            position,
            title: place.name
          });
          marker.addListener("click", () => setSelectedPlaceId(place.id));
          nextMarkers.push(marker);
          bounds.extend(position);
          hasBounds = true;
        });

        if (currentLocation) {
          const position = { lat: currentLocation.lat, lng: currentLocation.lng };
          nextMarkers.push(
            new google.maps.Marker({
              map,
              position,
              title: "אני כאן"
            })
          );
          bounds.extend(position);
          hasBounds = true;
        }

        visibleMembers.forEach((member) => {
          if (!member.liveLocation) {
            return;
          }

          nextMarkers.push(
            new google.maps.Marker({
              map,
              position: { lat: member.liveLocation.lat, lng: member.liveLocation.lng },
              title: member.name
            })
          );
        });
        if (hasBounds && (!existingMap || googleMapFitSignatureRef.current !== mapFitSignature)) {
          if (mapAnchorLocation) {
            const radiusCorners = getApproximateRadiusCorners(center, DEFAULT_NEARBY_MAP_RADIUS_KM);
            const radiusBounds = new google.maps.LatLngBounds();
            radiusBounds.extend(radiusCorners.southWest);
            radiusBounds.extend(radiusCorners.northEast);
            map.fitBounds(radiusBounds, 28);
          } else {
            map.fitBounds(bounds, 44);
          }
          googleMapFitSignatureRef.current = mapFitSignature;
        }
        googleMapMarkersRef.current = nextMarkers;
      } catch {
        // The fallback layer remains visible if Google Maps JS fails to load.
      }
    }

    void renderGoogleMap();

    return () => {
      cancelled = true;
      nextMarkers.forEach((marker) => marker.setMap?.(null));
      if (googleMapMarkersRef.current === nextMarkers) {
        googleMapMarkersRef.current = [];
      }
    };
  }, [currentLocation, googleMapsApiKey, mapAnchorLocation, mapFitSignature, mapPlaces, selectedPlace, visibleMembers]);

  useEffect(
    () => () => {
      if (locationWatchIdRef.current !== null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(locationWatchIdRef.current);
      }
      speechRecognitionRef.current?.abort();
    },
    []
  );

  const normalizedGoogleLink = setupDraft.googleLink.trim().toLowerCase();
  const googleSourceRecognized =
    normalizedGoogleLink.includes("maps.app.goo.gl") || normalizedGoogleLink.includes("google.com/maps");
  const googleSourceReady = googleSourceRecognized;
  const memberAgeNumber = Number(setupDraft.memberAge);
  const managerLocationReady = locationState === "enabled" || Boolean(currentLocation);
  const setupReadiness = {
    hasOwner: setupDraft.tripName.trim().length > 1,
    hasMembers:
      setupDraft.memberName.trim().length > 1 &&
      Number.isFinite(memberAgeNumber) &&
      memberAgeNumber > 0 &&
      memberAgeNumber < 120,
    hasGoogleSource: googleSourceReady,
    hasLocationConsentExplained: setupDraft.locationConsentExplained,
    hasAiPlanExplained: setupDraft.aiPlanConfirmed
  };
  const tripSourceStepReady = setupReadiness.hasOwner && setupReadiness.hasMembers && setupReadiness.hasGoogleSource;
  const activationSteps: Array<{ id: ActivationStep; label: string }> = [
    { id: "welcome", label: "קודי" },
    { id: "google", label: "מקור טיול" },
    { id: "manager_location", label: "מיקום מנהל" },
    { id: "ready", label: "כניסה" }
  ];
  const activationStepIndex = activationSteps.findIndex((step) => step.id === activationStep);
  const readinessItems = [
    { label: "שם טיול", ready: setupReadiness.hasOwner },
    { label: "חבר קבוצה ראשון", ready: setupReadiness.hasMembers },
    { label: "מקור Google", ready: setupReadiness.hasGoogleSource },
    { label: "מיקום מנהל", ready: setupReadiness.hasLocationConsentExplained && managerLocationReady },
    { label: "חשבון והפעלה", ready: setupReadiness.hasAiPlanExplained }
  ];
  const setupReady = readinessItems.every((item) => item.ready);

  async function openPlaceNavigation(place: TripPlace, target: "waze" | "maps" | "walking") {
    if (typeof place.lat !== "number" || typeof place.lng !== "number") {
      return;
    }

    setNavigationState("opening");

    try {
      const response = await fetch(`${apiBaseUrl}/api/navigation/links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          lat: place.lat,
          lng: place.lng,
          label: place.name
        })
      });

      if (!response.ok) {
        throw new Error(`Navigation API failed with ${response.status}`);
      }

      const links = (await response.json()) as NavigationLinksResponse;
      const href = target === "waze" ? links.waze.web : target === "walking" ? links.googleMapsWalking : links.googleMaps;
      window.open(href, "_blank", "noopener,noreferrer");
      setNavigationState("idle");
    } catch {
      setNavigationState("error");
    }
  }

  async function openSelectedPlaceInWaze() {
    if (!selectedPlace || !canNavigate) {
      return;
    }

    await openPlaceNavigation(selectedPlace, "waze");
  }

  async function openSelectedPlaceInGoogleMapsWalking() {
    if (!selectedPlace || !canNavigate) {
      return;
    }

    await openPlaceNavigation(selectedPlace, "walking");
  }

  function focusPlaceOnMap(place: TripPlace) {
    setSelectedPlaceId(place.id);
    if (typeof place.lat === "number" && typeof place.lng === "number") {
      setExpandedPlaceId((currentId) => (currentId === place.id ? currentId : null));
    }
  }

  function prepareKodiPlaceQuestion(place: TripPlace) {
    setSelectedPlaceId(place.id);
    setDraft(`קודי, ספר לי על ${place.name} ותעזור לי להבין אם זה מתאים לנו עכשיו`);
  }

  function removePlaceFromRoute(place: TripPlace) {
    rememberLocallyRemovedPlaceId(place.id);
    setPlaces((currentPlaces) => {
      const nextPlaces = currentPlaces.filter((item) => item.id !== place.id);
      setSummary(buildTripSummaryFromPlaces(nextPlaces));
      setSelectedPlaceId((currentSelectedId) =>
        currentSelectedId === place.id ? (nextPlaces[0]?.id ?? "") : currentSelectedId
      );
      return nextPlaces;
    });
    setExpandedPlaceId((currentExpandedId) => (currentExpandedId === place.id ? null : currentExpandedId));
  }

  function openCurrentMapInGoogleMaps() {
    const focusedLocation =
      mapAnchorLocation ??
      (typeof selectedPlace?.lat === "number" && typeof selectedPlace.lng === "number"
        ? { lat: selectedPlace.lat, lng: selectedPlace.lng }
        : mapPlaces[0]);

    const url = focusedLocation
      ? `https://www.google.com/maps/@${Number(focusedLocation.lat)},${Number(focusedLocation.lng)},10z`
      : "https://www.google.com/maps";

    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function requestGroupDestinationApproval() {
    if (!selectedPlace) {
      return;
    }

    setActionApprovalState("checking");

    try {
      const response = await fetch(`${apiBaseUrl}/api/trips/demo/agent-actions/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          member: {
            id: activeMember.id,
            displayName: activeMember.name,
            role: activeMember.role
          },
          actionType: "set_group_destination"
        })
      });

      const data = (await response.json()) as AgentActionAuthorizationResponse;

      if (!response.ok || !data.allowed) {
        setActionApprovalState("blocked");
        return;
      }

      const destinationResponse = await fetch(`${apiBaseUrl}/api/trips/demo/group-destination`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          member: {
            id: activeMember.id,
            displayName: activeMember.name,
            role: activeMember.role
          },
          placeId: selectedPlace.id
        })
      });

      if (!destinationResponse.ok) {
        setActionApprovalState(destinationResponse.status === 403 ? "blocked" : "error");
        return;
      }

      const destinationData = (await destinationResponse.json()) as GroupDestinationResponse;
      setGroupDestination(destinationData.destination);

      const approvalMessage: ChatMessage = {
        id: `local-action-${Date.now()}`,
        author: "קודי",
        text: `${activeMember.name} אישר/ה להפוך את ${selectedPlace.name} ליעד הקבוצתי הנוכחי. כולם רואים עכשיו את היעד במפה, וההרשאה נאכפה בשרת.`,
        source: "agent",
        createdAt: new Date().toISOString()
      };

      setMessages((currentMessages) => [...currentMessages, approvalMessage]);
      await persistChatMessage(approvalMessage);
      setActionApprovalState("approved");
    } catch {
      setActionApprovalState("error");
    }
  }

  async function requestGroupRouteApproval() {
    if (!selectedPlace) {
      return;
    }

    const routePlaceIds = [selectedPlace.id, ...visiblePlaces.filter((place) => place.id !== selectedPlace.id).slice(0, 3).map((place) => place.id)];
    if (routePlaceIds.length < 2) {
      setRouteApprovalState("error");
      return;
    }

    setRouteApprovalState("checking");

    try {
      const response = await fetch(`${apiBaseUrl}/api/trips/demo/agent-actions/authorize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          member: {
            id: activeMember.id,
            displayName: activeMember.name,
            role: activeMember.role
          },
          actionType: "create_route"
        })
      });

      const data = (await response.json()) as AgentActionAuthorizationResponse;
      if (!response.ok || !data.allowed) {
        setRouteApprovalState("blocked");
        return;
      }

      const routeResponse = await fetch(`${apiBaseUrl}/api/trips/demo/group-route`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          member: {
            id: activeMember.id,
            displayName: activeMember.name,
            role: activeMember.role
          },
          placeIds: routePlaceIds,
          title: `מסלול קצר סביב ${selectedPlace.name}`
        })
      });

      if (!routeResponse.ok) {
        setRouteApprovalState(routeResponse.status === 403 ? "blocked" : "error");
        return;
      }

      const routeData = (await routeResponse.json()) as GroupRouteResponse;
      setGroupRoute(routeData.route);
      setActiveRouteStopIndex(0);

      const routeMessage: ChatMessage = {
        id: `local-route-${Date.now()}`,
        author: "קודי",
        text: `${activeMember.name} אישר/ה מסלול קבוצתי קצר סביב ${selectedPlace.name}. המסלול נשמר ומוצג עכשיו לכל הקבוצה.`,
        source: "agent",
        createdAt: new Date().toISOString()
      };

      setMessages((currentMessages) => [...currentMessages, routeMessage]);
      await persistChatMessage(routeMessage);
      setRouteApprovalState("approved");
    } catch {
      setRouteApprovalState("error");
    }
  }

  async function openActiveRouteStopInWaze() {
    const activeStop = groupRoute?.stops[activeRouteStopIndex];
    if (!activeStop || typeof activeStop.lat !== "number" || typeof activeStop.lng !== "number") {
      setNavigationState("error");
      return;
    }

    setNavigationState("opening");

    try {
      const response = await fetch(`${apiBaseUrl}/api/navigation/links`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          lat: activeStop.lat,
          lng: activeStop.lng,
          label: activeStop.placeName
        })
      });

      if (!response.ok) {
        throw new Error(`Navigation API failed with ${response.status}`);
      }

      const links = (await response.json()) as NavigationLinksResponse;
      window.open(links.waze.web, "_blank", "noopener,noreferrer");
      setNavigationState("idle");
    } catch {
      setNavigationState("error");
    }
  }

  async function completeActiveRouteStop() {
    const activeStop = groupRoute?.stops[activeRouteStopIndex];
    if (!activeStop) {
      setRouteApprovalState("error");
      return;
    }

    setRouteApprovalState("checking");

    try {
      const response = await fetch(`${apiBaseUrl}/api/trips/demo/group-route/progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          member: {
            id: activeMember.id,
            displayName: activeMember.name,
            role: activeMember.role
          }
        })
      });

      if (!response.ok) {
        setRouteApprovalState(response.status === 403 ? "blocked" : "error");
        return;
      }

      const progressData = (await response.json()) as {
        route: GroupRoute;
        completedStop: GroupRoute["stops"][number];
        routeCompleted: boolean;
      };
      setGroupRoute(progressData.route);
      setActiveRouteStopIndex(progressData.route.activeStopIndex);

      const progressMessage: ChatMessage = {
        id: `local-route-progress-${Date.now()}`,
        author: "קודי",
        text: progressData.routeCompleted
          ? `${activeMember.name} סימן/ה את ${progressData.completedStop.placeName} כהושלמה. המסלול הקבוצתי הושלם.`
          : `${activeMember.name} סימן/ה את ${progressData.completedStop.placeName} כהושלמה. התחנה הפעילה הבאה במסלול היא ${progressData.route.stops[progressData.route.activeStopIndex]?.placeName ?? "סיום המסלול"}.`,
        source: "agent",
        createdAt: new Date().toISOString()
      };

      setMessages((currentMessages) => [...currentMessages, progressMessage]);
      await persistChatMessage(progressMessage);
      setRouteApprovalState("approved");
    } catch {
      setRouteApprovalState("error");
    }
  }

  async function getFreshCurrentLocationForAgent(text: string) {
    if (!isCurrentLocationQuestion(text) || !("geolocation" in navigator)) {
      return currentLocation;
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 8000
        });
      });
      const nextLocation: CurrentLocationState = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyMeters: position.coords.accuracy,
        updatedAt: new Date().toISOString()
      };

      setCurrentLocation(nextLocation);
      setLocationState("enabled");
      setSetupDraft((draft) => ({ ...draft, locationConsentExplained: true }));
      return nextLocation;
    } catch {
      return currentLocation;
    }
  }

  async function requestKodiReply(text: string, nextMessages: ChatMessage[]) {
    try {
      const agentCurrentLocation = await getFreshCurrentLocationForAgent(text);
      const response = await fetch(`${apiBaseUrl}/api/agent/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tripGroupId: "group_family_greece_demo",
          member: {
            id: activeMember.id,
            displayName: activeMember.name,
            role: activeMember.role,
            ageGroup: activeMember.ageGroup
          },
          message: text,
          recentMessages: nextMessages.slice(-24),
          context: {
            permissionPolicy: {
              operationalChangesRequireAdmin: true,
              canShareLiveLocation: false
            },
            currentLocation: agentCurrentLocation
              ? { lat: agentCurrentLocation.lat, lng: agentCurrentLocation.lng }
              : undefined
          },
          selectedPlace: shouldAttachSelectedPlaceToAgent(text) ? selectedPlace : undefined
        })
      });

      if (!response.ok) {
        throw new Error(`Agent API failed with ${response.status}`);
      }

      const data = (await response.json()) as AgentMessageResponse;
      return data.text;
    } catch {
      return buildKodiFallbackReply(nextMessages, selectedPlace);
    }
  }

  function playChatTone(kind: "record-start" | "voice-sent") {
    if (typeof window === "undefined") {
      return;
    }

    const AudioContextCtor =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    try {
      const audioContext = new AudioContextCtor();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const now = audioContext.currentTime;
      const frequency = kind === "record-start" ? 740 : 960;
      const duration = kind === "record-start" ? 0.08 : 0.11;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
      oscillator.onended = () => {
        void audioContext.close();
      };
    } catch {
      // Audio feedback is helpful but non-critical; browsers may block it.
    }
  }

  async function persistChatMessage(message: ChatMessage) {
    try {
      const response = await fetch(`${apiBaseUrl}/api/trips/demo/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          author: message.author,
          text: message.text,
          memberId: message.memberId,
          source: message.source
        })
      });

      if (!response.ok) {
        throw new Error(`Message persistence failed with ${response.status}`);
      }

      const payload = (await response.json()) as { message: ChatMessage };
      await refreshTripEvents();
      return payload.message;
    } catch {
      return message;
    }
  }

  function scheduleVoiceConversationListening(delayMs = 650) {
    if (!voiceConversationActiveRef.current) {
      return;
    }

    window.setTimeout(() => {
      if (
        voiceConversationActiveRef.current &&
        !speechRecognitionRef.current &&
        !isKodiThinkingRef.current &&
        speechOutputStateRef.current === "idle"
      ) {
        startVoiceInput("conversation");
      }
    }, delayMs);
  }

  function startVoiceInput(mode: "push" | "conversation" = "push") {
    if (typeof window === "undefined") {
      return;
    }

    const SpeechRecognitionCtor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setSpeechState("unsupported");
      return;
    }

    speechRecognitionRef.current?.abort();
    voiceInputModeRef.current = mode;
    voiceTranscriptRef.current = "";
    voiceShouldSendRef.current = mode === "conversation";
    const recognition = new SpeechRecognitionCtor();
    speechRecognitionRef.current = recognition;
    recognition.lang = "he-IL";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => setSpeechState("listening");
    recognition.onerror = () => {
      voiceShouldSendRef.current = false;
      setSpeechState("error");
      if (voiceInputModeRef.current === "conversation") {
        scheduleVoiceConversationListening(1200);
      }
    };
    recognition.onend = () => {
      setSpeechState((currentState) => (currentState === "listening" ? "idle" : currentState));
      speechRecognitionRef.current = null;

      const spokenText = voiceTranscriptRef.current.trim();
      const voiceMode = voiceInputModeRef.current;
      voiceTranscriptRef.current = "";
      if (voiceShouldSendRef.current && spokenText) {
        voiceShouldSendRef.current = false;
        playChatTone("voice-sent");
        void submitChatText(spokenText, {
          forceKodi: voiceMode === "conversation",
          speakReply: voiceMode === "conversation" || shouldSpeakKodiReply(spokenText)
        });
      } else {
        voiceShouldSendRef.current = false;
        if (voiceMode === "conversation") {
          scheduleVoiceConversationListening();
        }
      }
    };
    recognition.onresult = (event) => {
      const spokenText = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (spokenText) {
        voiceTranscriptRef.current = spokenText;
      }
    };
    try {
      playChatTone("record-start");
      recognition.start();
    } catch {
      setSpeechState("error");
      speechRecognitionRef.current = null;
    }
  }

  function finishVoiceInput() {
    if (!speechRecognitionRef.current) {
      return;
    }

    voiceShouldSendRef.current = true;
    speechRecognitionRef.current.stop();
  }

  function cancelVoiceInput() {
    voiceShouldSendRef.current = false;
    voiceTranscriptRef.current = "";
    speechRecognitionRef.current?.abort();
    speechRecognitionRef.current = null;
    setSpeechState("idle");
  }

  function startVoiceConversation() {
    setVoiceConversationActive(true);
    voiceConversationActiveRef.current = true;
    stopKodiSpeech();
    startVoiceInput("conversation");
  }

  function stopVoiceConversation() {
    setVoiceConversationActive(false);
    voiceConversationActiveRef.current = false;
    cancelVoiceInput();
    stopKodiSpeech();
  }

  function toggleVoiceConversation() {
    if (voiceConversationActiveRef.current) {
      stopVoiceConversation();
      return;
    }

    startVoiceConversation();
  }

  function stopKodiSpeech() {
    speechRequestTokenRef.current += 1;
    window.speechSynthesis?.cancel();
    speechAudioRef.current?.pause();
    speechAudioRef.current = null;
    if (speechAudioUrlRef.current && !speechAudioUrlIsCachedRef.current) {
      URL.revokeObjectURL(speechAudioUrlRef.current);
    }
    speechAudioUrlRef.current = null;
    speechAudioUrlIsCachedRef.current = false;
    setSpeechOutputState("idle");
    setSpeakingMessageId(null);
  }

  async function getKodiSpeechAudioUrl(speechText: string) {
    const cachedUrl = speechAudioCacheRef.current.get(speechText);
    if (cachedUrl) {
      return cachedUrl;
    }

    const pending = speechAudioPendingRef.current.get(speechText);
    if (pending) {
      return pending;
    }

    const request = (async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/agent/speech`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            text: speechText,
            memberId: activeMember.id,
            memberName: activeMember.name,
            memberRole: activeMember.role
          })
        });

        if (!response.ok) {
          throw new Error(`Kodi speech API failed with ${response.status}`);
        }

        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        speechAudioCacheRef.current.set(speechText, audioUrl);

        while (speechAudioCacheRef.current.size > 8) {
          const oldestKey = speechAudioCacheRef.current.keys().next().value;
          const oldestUrl = oldestKey ? speechAudioCacheRef.current.get(oldestKey) : undefined;
          if (!oldestKey || !oldestUrl) {
            break;
          }
          URL.revokeObjectURL(oldestUrl);
          speechAudioCacheRef.current.delete(oldestKey);
        }

        return audioUrl;
      } catch {
        return null;
      } finally {
        speechAudioPendingRef.current.delete(speechText);
      }
    })();

    speechAudioPendingRef.current.set(speechText, request);
    return request;
  }

  function prefetchKodiSpeech(text: string) {
    const speechText = buildSpeechText(text);
    if (!speechText || speechAudioCacheRef.current.has(speechText) || speechAudioPendingRef.current.has(speechText)) {
      return;
    }

    void getKodiSpeechAudioUrl(speechText);
  }

  async function playKodiSpeechAudioUrl(audioUrl: string, messageId?: string) {
    window.speechSynthesis?.cancel();
    speechAudioRef.current?.pause();
    if (speechAudioUrlRef.current && !speechAudioUrlIsCachedRef.current) {
      URL.revokeObjectURL(speechAudioUrlRef.current);
    }

    const audio = new Audio(audioUrl);
    speechAudioRef.current = audio;
    speechAudioUrlRef.current = audioUrl;
    speechAudioUrlIsCachedRef.current = true;
    setSpeechOutputState("speaking");
    setSpeakingMessageId(messageId ?? null);

    audio.onended = () => {
      if (speechAudioUrlRef.current === audioUrl) {
        speechAudioRef.current = null;
        speechAudioUrlRef.current = null;
        speechAudioUrlIsCachedRef.current = false;
        setSpeechOutputState("idle");
        setSpeakingMessageId(null);
        scheduleVoiceConversationListening();
      }
    };
    audio.onerror = () => {
      if (speechAudioUrlRef.current === audioUrl) {
        speechAudioRef.current = null;
        speechAudioUrlRef.current = null;
        speechAudioUrlIsCachedRef.current = false;
      }
      setSpeechOutputState("error");
      setSpeakingMessageId(null);
    };

    await audio.play();
  }

  function speakKodiMessageWithBrowserVoice(text: string, messageId?: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
      setSpeechOutputState("unsupported");
      return;
    }

    const speechText = buildSpeechText(text);
    if (!speechText) {
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText);
    const kodiVoice = getKodiHebrewVoice();
    utterance.lang = "he-IL";
    if (kodiVoice) {
      utterance.voice = kodiVoice;
      utterance.lang = kodiVoice.lang || "he-IL";
    }
    utterance.rate = 1.14;
    utterance.pitch = 1;
    utterance.volume = 1;
    setSpeechOutputState("speaking");
    setSpeakingMessageId(messageId ?? null);
    utterance.onstart = () => {
      setSpeechOutputState("speaking");
      setSpeakingMessageId(messageId ?? null);
    };
    utterance.onend = () => {
      setSpeechOutputState("idle");
      setSpeakingMessageId(null);
      scheduleVoiceConversationListening();
    };
    utterance.onerror = () => {
      setSpeechOutputState("error");
      setSpeakingMessageId(null);
    };
    window.speechSynthesis.speak(utterance);
    window.speechSynthesis.resume();
  }

  async function speakKodiMessage(text: string, messageId?: string) {
    const speechText = buildSpeechText(text);
    if (!speechText) {
      return;
    }

    stopKodiSpeech();
    const requestToken = speechRequestTokenRef.current;
    setSpeechOutputState("preparing");
    setSpeakingMessageId(messageId ?? null);

    const audioUrl = await getKodiSpeechAudioUrl(speechText);
    if (speechRequestTokenRef.current !== requestToken) {
      return;
    }

    if (!audioUrl) {
      setSpeechOutputState("error");
      setSpeakingMessageId(null);
      return;
    }

    try {
      await playKodiSpeechAudioUrl(audioUrl, messageId);
    } catch {
      setSpeechOutputState("error");
      setSpeakingMessageId(null);
    }
  }

  async function speakKodiMessageWithServerVoice(text: string, messageId?: string) {
    const speechText = buildSpeechText(text);
    if (!speechText) {
      return;
    }

    stopKodiSpeech();
    setSpeechOutputState("speaking");
    setSpeakingMessageId(messageId ?? null);

    try {
      const response = await fetch(`${apiBaseUrl}/api/agent/speech`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: speechText,
          memberId: activeMember.id,
          memberName: activeMember.name,
          memberRole: activeMember.role
        })
      });

      if (!response.ok) {
        throw new Error(`Kodi speech API failed with ${response.status}`);
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      speechAudioRef.current = audio;
      speechAudioUrlRef.current = audioUrl;

      audio.onended = () => {
        if (speechAudioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          speechAudioUrlRef.current = null;
          speechAudioRef.current = null;
          setSpeechOutputState("idle");
          setSpeakingMessageId(null);
          scheduleVoiceConversationListening();
        }
      };
      audio.onerror = () => {
        if (speechAudioUrlRef.current === audioUrl) {
          URL.revokeObjectURL(audioUrl);
          speechAudioUrlRef.current = null;
          speechAudioRef.current = null;
        }
        speakKodiMessageWithBrowserVoice(speechText, messageId);
      };
      await audio.play();
    } catch {
      speakKodiMessageWithBrowserVoice(speechText, messageId);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();
    if (!text) {
      return;
    }

    const nextMessages = [...messages, { author: activeMember.name, text }];
    const shouldAskKodi = shouldWakeKodi(text, messages);

    setDraft("");
    setMessages(nextMessages);

    if (shouldAskKodi) {
      const reply = await requestKodiReply(text, nextMessages);
      const localKodiMessage = { id: `local-kodi-${Date.now()}`, author: "קודי" as const, text: reply };
      setMessages((currentMessages) => [...currentMessages, localKodiMessage]);
      if (shouldSpeakKodiReply(text)) {
        speakKodiMessage(reply, localKodiMessage.id);
      }
    }
  }

  async function submitChatText(
    rawText: string,
    options: {
      forceKodi?: boolean;
      speakReply?: boolean;
    } = {}
  ) {
    const text = rawText.trim();
    if (!text) {
      return;
    }

    const localUserMessage: ChatMessage = {
      id: `local-${Date.now()}`,
      author: activeMember.name,
      text,
      memberId: activeMember.id,
      source: "member",
      createdAt: new Date().toISOString()
    };
    const nextMessages = [...messages, localUserMessage];
    const shouldAskKodi = options.forceKodi || shouldWakeKodi(text, messages);

    setDraft("");
    setMessages(nextMessages);

    const savedUserMessagePromise = persistChatMessage(localUserMessage);

    if (shouldAskKodi) {
      setIsKodiThinking(true);
      try {
        const reply = await requestKodiReply(text, nextMessages);
        const localKodiMessage: ChatMessage = {
          id: `local-kodi-${Date.now()}`,
          author: "קודי",
          text: reply,
          source: "agent",
          createdAt: new Date().toISOString()
        };

        setMessages((currentMessages) => [...currentMessages, localKodiMessage]);
        prefetchKodiSpeech(reply);
        if (options.speakReply || shouldSpeakKodiReply(text)) {
          speakKodiMessage(reply, localKodiMessage.id);
        }

        const savedKodiMessage = await persistChatMessage(localKodiMessage);
        setMessages((currentMessages) =>
          currentMessages.map((message) => (message.id === localKodiMessage.id ? savedKodiMessage : message))
        );
      } finally {
        setIsKodiThinking(false);
      }
    }

    const savedUserMessage = await savedUserMessagePromise;
    setMessages((currentMessages) =>
      currentMessages.map((message) => (message.id === localUserMessage.id ? savedUserMessage : message))
    );
  }

  async function sendMessageWithPersistence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitChatText(draft);
  }

  function addUserShortcut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const label = shortcutLabelDraft.trim();
    const url = shortcutUrlDraft.trim();

    if (!label || !/^https?:\/\//i.test(url)) {
      return;
    }

    setUserShortcuts((currentShortcuts) => [
      ...currentShortcuts,
      {
        id: `${Date.now()}-${label}`,
        label,
        url
      }
    ]);
    setShortcutLabelDraft("");
    setShortcutUrlDraft("");
  }

  async function copyTripInviteLink() {
    setInviteCopyState("idle");
    setInviteShareState("idle");

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tripInviteUrl);
      } else {
        throw new Error("clipboard_unavailable");
      }

      setInviteCopyState("copied");
    } catch {
      setInviteCopyState("error");
    }
  }

  async function shareTripInvite() {
    setInviteCopyState("idle");
    setInviteShareState("sharing");

    const shareData = {
      title: "הצטרפות לקבוצת הטיול בקודי",
      text: `הצטרפות לקבוצת הטיול ${setupDraft.tripName || "בקודי"}`,
      url: tripInviteUrl
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
        setInviteShareState("shared");
        return;
      }

      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tripInviteUrl);
        setInviteShareState("copied");
        return;
      }

      throw new Error("share_unavailable");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setInviteShareState("idle");
        return;
      }

      setInviteShareState("error");
    }
  }

  async function installKodiShortcut() {
    if (!installPrompt) {
      setInstallState((current) => (current === "installed" ? "installed" : "unavailable"));
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    setInstallState(choice.outcome === "accepted" ? "installed" : "unavailable");
  }

  async function joinTripFromInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = joinDraft.name.trim();
    if (name.length < 2) {
      return;
    }

    setMemberActionState("working");
    const nextMember: DemoMember = {
      id: `guest-${Date.now()}`,
      name,
      role: "member",
      ageGroup: getAgeGroupFromDraft(joinDraft.age),
      locationSharing: "disabled",
      liveLocation: null
    };
    const numericAge = Number(joinDraft.age);
    const safeAge = Number.isInteger(numericAge) && numericAge >= 0 && numericAge <= 120 ? numericAge : undefined;

    let joinedMember = nextMember;
    let welcomeMessage: ChatMessage | null = null;
    try {
      const response = await fetch(`${apiBaseUrl}/api/trips/demo/members`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          displayName: name,
          age: safeAge,
          ageGroup: getAgeGroupFromDraft(joinDraft.age)
        })
      });

      if (!response.ok) {
        throw new Error(`Join failed with ${response.status}`);
      }

      const payload = (await response.json()) as {
        member: TripMemberLocationResponse["members"][number];
        members: TripMemberLocationResponse["members"];
        welcomeMessage?: ChatMessage;
      };
      joinedMember = mapMemberLocations([payload.member])[0] ?? nextMember;
      welcomeMessage = payload.welcomeMessage ?? null;
      setMembers(normalizeTripMembers(mapMemberLocations(payload.members), setupDraft.memberName));
    } catch {
      setMembers((currentMembers) => [...currentMembers, nextMember]);
      welcomeMessage = {
        id: `local-join-${Date.now()}`,
        author: "קודי",
        text: `ברוך הבא ${name} לקבוצת הטיול 🙂 אני קודי, סוכן הטיול של הקבוצה, כאן כדי לעזור במסלול, במפה ובהמלצות בדרך.`,
        source: "agent",
        createdAt: new Date().toISOString()
      };
      setMemberActionState("error");
    }

    setActiveMemberId(joinedMember.id);
    setShowJoinFlow(false);
    setShowActivation(false);
    if (welcomeMessage) {
      setMessages((currentMessages) => mergeChatMessages(currentMessages, [welcomeMessage]));
    }
    setMemberActionState("done");
  }

  async function removeTripMember(memberId: string) {
    if (memberActionState === "working") {
      return;
    }

    const target = members.find((member) => member.id === memberId);
    if (!target || target.role === "owner") {
      return;
    }

    setMemberActionState("working");
    try {
      const response = await fetch(`${apiBaseUrl}/api/trips/demo/members/${encodeURIComponent(memberId)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          actorMemberId: activeMember.id
        })
      });

      if (!response.ok) {
        throw new Error(`Remove member failed with ${response.status}`);
      }

      const payload = (await response.json()) as { members: TripMemberLocationResponse["members"] };
      const nextMembers = normalizeTripMembers(mapMemberLocations(payload.members), setupDraft.memberName);
      setMembers(nextMembers);
      if (activeMemberId === memberId) {
        setActiveMemberId(nextMembers.find((member) => member.role === "owner")?.id ?? nextMembers[0]?.id ?? "mom");
      }
      setMemberActionState("done");
    } catch {
      setMemberActionState("error");
    }
  }

  function leaveTripGroup() {
    void removeTripMember(activeMember.id);
  }

  async function requestTripMapSwitch() {
    const nextName = mapSwitchDraft.name.trim();
    const nextLink = mapSwitchDraft.googleLink.trim();
    if (!nextName && !nextLink) {
      return;
    }

    const effectiveTripName = nextName || setupDraft.tripName || setupState?.setupSummary?.tripName || "טיול חדש";
    const effectiveGoogleLink = nextLink || setupDraft.googleLink || setupState?.setupSummary?.googleLink || "";

    if (!/maps\.app\.goo\.gl|google\.com\/maps/i.test(effectiveGoogleLink)) {
      setMapSwitchState("error");
      setMapSwitchMessage("כדי להחליף מפה ונקודות צריך קישור צפייה תקין של Google Maps.");
      return;
    }

    setMapSwitchState("working");
    setMapSwitchMessage("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/trips/demo/google-source/switch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          actorMemberId: activeMember.id,
          tripName: effectiveTripName,
          googleLink: effectiveGoogleLink
        })
      });

      if (!response.ok) {
        throw new Error(`Map source switch failed with ${response.status}`);
      }

      const payload = (await response.json()) as TripMapSourceSwitchResponse;
      setSetupState(payload.setupState);
      setSetupDraft((draft) => ({
        ...draft,
        tripName: payload.googleSourceSwitch.tripName,
        googleLink: payload.googleSourceSwitch.googleLink
      }));
      setMapSwitchDraft({ name: "", googleLink: "" });
      setMapSwitchState("done");
      setMapSwitchMessage(
        `מפת הטיול הפעילה הוחלפה ל-${payload.googleSourceSwitch.tripName}. מקור Google נשמר; ייבוא מלא של נקודות פרטיות דורש OAuth.`
      );
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `local-map-source-${Date.now()}`,
          author: "קודי",
          text: `עדכנתי את מקור מפת הטיול ל-${payload.googleSourceSwitch.tripName}. עכשיו אשתמש בשם ובקישור הזה כהקשר הטיול הפעיל. כדי למשוך אוטומטית את כל נקודות המפה הפרטית מגוגל נצטרך לחבר OAuth/ייבוא נקודות בשלב הבא.`,
          source: "agent",
          createdAt: new Date().toISOString()
        }
      ]);
      setSecondaryMenuOpen(false);
    } catch {
      setMapSwitchState("error");
      setMapSwitchMessage("לא הצלחתי להחליף את מקור המפה. ודא שאתה מנהל ושיש קישור Google Maps תקין.");
    }
  }

  function enablePersonalGps() {
    if (!("geolocation" in navigator)) {
      setLocationState("error");
      return;
    }

    if (locationWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
    }

    setLocationState("requesting");
    locationWatchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const nextLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          updatedAt: new Date().toISOString()
        };

        setCurrentLocation(nextLocation);
        setLocationState("enabled");
        setSetupDraft((draft) => ({ ...draft, locationConsentExplained: true }));

        try {
          const response = await fetch(`${apiBaseUrl}/api/trips/demo/members/${activeMember.id}/location`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              lat: nextLocation.lat,
              lng: nextLocation.lng,
              accuracyMeters: nextLocation.accuracyMeters
            })
          });

          if (response.status === 403) {
            setLocationSyncState("blocked");
            return;
          }

          if (!response.ok) {
            throw new Error(`Location update failed with ${response.status}`);
          }

          const payload = (await response.json()) as { member: TripMemberLocationResponse["members"][number] };
          setMembers((currentMembers) =>
            currentMembers.map((member) =>
              member.id === activeMember.id
                ? {
                    ...member,
                    locationSharing: payload.member.consent.state,
                    liveLocation: payload.member.liveLocation
                      ? {
                          lat: payload.member.liveLocation.lat,
                          lng: payload.member.liveLocation.lng,
                          label: payload.member.displayLabel ?? "מיקום חי במפה",
                          updatedMinutesAgo: payload.member.updatedMinutesAgo ?? 0
                        }
                      : member.liveLocation
                  }
                : member
            )
          );
          setLocationSyncState("synced");
          await refreshTripEvents();
        } catch {
          setLocationSyncState("error");
        }
      },
      () => {
        setLocationState("error");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5_000,
        timeout: 15_000
      }
    );
  }

  async function saveSetupAndStart() {
    if (!setupReady || setupSaveState === "saving") {
      return;
    }

    setSetupSaveState("saving");
    setSetupSaveError("");

    try {
      const response = await fetch(`${apiBaseUrl}/api/trips/demo/setup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          tripName: setupDraft.tripName.trim(),
          firstMemberName: setupDraft.memberName.trim(),
          firstMemberAge: Number(setupDraft.memberAge),
          googleLink: setupDraft.googleLink.trim(),
          aiPlanConfirmed: setupDraft.aiPlanConfirmed,
          locationConsentExplained: setupDraft.locationConsentExplained
        })
      });

      if (!response.ok) {
        throw new Error(`Setup API failed with ${response.status}`);
      }

      const nextSetupState = (await response.json()) as TripSetupStateResponse;
      setSetupState(nextSetupState);
      setSetupSaveState("saved");
      rememberLocalSetupCompleted();
      setMembers(normalizeTripMembers(members, setupDraft.memberName));
      setShowActivation(false);
    } catch {
      setSetupSaveState("error");
      setSetupSaveError("לא הצלחתי לשמור את ההרשמה מול השרת. אפשר לבדוק שה-API פעיל ולנסות שוב.");
    }
  }

  if (showJoinFlow) {
    return (
      <main className="join-shell" aria-label="הצטרפות לקבוצת טיול">
        <section className="join-card">
          <span className="eyebrow">הזמנה לקבוצת טיול</span>
          <h1>מצטרפים לקודי</h1>
          <p>
            {managerMember.name} כבר הפעיל/ה את קודי, המפה ומיקום המנהל. עכשיו אפשר להצטרף לשיחת המשפחה ולאשר
            הרשאות מהמכשיר שלך.
          </p>
          <form className="join-form" onSubmit={joinTripFromInvite}>
            <label>
              איך לקרוא לך בקבוצה?
              <input
                aria-label="שם משתתף להצטרפות"
                onChange={(event) => setJoinDraft((draft) => ({ ...draft, name: event.target.value }))}
                placeholder="שם"
                value={joinDraft.name}
              />
            </label>
            <label>
              גיל (לא חובה)
              <input
                aria-label="גיל משתתף להצטרפות"
                inputMode="numeric"
                onChange={(event) => setJoinDraft((draft) => ({ ...draft, age: event.target.value }))}
                placeholder="לא חובה"
                value={joinDraft.age}
              />
            </label>
            <button disabled={joinDraft.name.trim().length < 2} type="submit">
              הצטרפות לקבוצה
            </button>
          </form>
          <div className="join-consent-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <p>אישור מיקום נעשה בנפרד מהמכשיר שלך. בלי אישור מיקום, אפשר עדיין להשתתף בשיחה עם קודי.</p>
          </div>
        </section>
      </main>
    );
  }

  if (showActivation) {
    return (
      <main className="activation-shell" aria-label="קליטת משתמש והפעלת קודי">
        <section className="activation-map-preview" aria-label="תצוגת מפת טיול">
          <div className="activation-top">
            <button className="icon-button" aria-label="תפריט">
              <Menu size={22} aria-hidden="true" />
            </button>
            <div>
              <h1>מלווה טיול AI</h1>
              <p>Welcome + Activation עם קודי</p>
            </div>
          </div>
          <div className="activation-map-content">
            <Sparkles size={42} aria-hidden="true" />
            <strong>לפני שיוצאים לדרך, קודי מפעיל את המערכת</strong>
            <span>
              {setupState?.googleSource.importedPlacesCount ?? summary.total} נקודות טיול מוכנות · קבוצה משפחתית ·
              מיקום בהרשאה בלבד
            </span>
          </div>
        </section>

        <aside className="activation-panel guided-activation">
          <div className="activation-progress" aria-label="שלבי התחלה">
            {activationSteps.map((step, index) => (
              <span
                className={index < activationStepIndex ? "done" : index === activationStepIndex ? "current" : ""}
                key={step.id}
              >
                {step.label}
              </span>
            ))}
          </div>

          {activationStep === "welcome" ? (
            <section className="guided-step" aria-label="הפעלת קודי">
              <span className="eyebrow">שלב 1 מתוך 4</span>
              <h2>שלום, אני קודי</h2>
              <p>
                אני מלווה הטיול של הקבוצה. אחרי ההפעלה אעזור לחבר מקור טיול, להפעיל מיקום מנהל, ואז ניכנס למפה
                ולשיחה.
              </p>
              <div className="kodi-dialogue-preview">
                <strong>אחרי החיבור נכנסים למפה ולשיחה</strong>
                <p>קודי יפעל מתוך ההקשר של הטיול, המיקום והשיחה הקבוצתית.</p>
              </div>
              <div className="plan-note">
                <ShieldCheck size={18} aria-hidden="true" />
                <p>קודי עובד דרך חשבון מנהל הטיול ותקציב API מרכזי, כדי שהמשפחה לא תצטרך מנוי נפרד.</p>
              </div>
              <button
                className="primary-action"
                type="button"
                onClick={() => {
                  setSetupDraft((draft) => ({ ...draft, aiPlanConfirmed: true }));
                  setActivationStep("google");
                }}
              >
                הפעל את קודי
              </button>
            </section>
          ) : null}

          {activationStep === "google" ? (
            <section className="guided-step" aria-label="חיבור מקור טיול">
              <span className="eyebrow">שלב 2 מתוך 4</span>
              <h2>מאיפה לקרוא את הטיול?</h2>
              <p>
                קודי מתחיל מחיבור חשבון הטיול ומקור Google. בשלב הבא הוא יבחר מפה מתוך החשבון, למשל "טיול צפון יוון".
                כרגע מדביקים קישור צפייה כדי לסמן את מקור הטיול.
              </p>
              <div className="setup-form single-flow-form">
                <label>
                  שם הטיול
                  <input
                    aria-label="שם הטיול"
                    onChange={(event) => setSetupDraft((draft) => ({ ...draft, tripName: event.target.value }))}
                    placeholder="שם הטיול"
                    value={setupDraft.tripName}
                  />
                </label>
                <label>
                  קישור צפייה מ-Google Maps
                  <input
                    aria-label="קישור Google Maps"
                    dir="ltr"
                    onChange={(event) => setSetupDraft((draft) => ({ ...draft, googleLink: event.target.value }))}
                    placeholder="https://maps.app.goo.gl/..."
                    value={setupDraft.googleLink}
                  />
                </label>
                <label>
                  שם מנהל הטיול
                  <input
                    aria-label="שם מנהל הטיול"
                    onChange={(event) => setSetupDraft((draft) => ({ ...draft, memberName: event.target.value }))}
                    placeholder="שם מלא"
                    value={setupDraft.memberName}
                  />
                </label>
                <label>
                  גיל מנהל הטיול
                  <input
                    aria-label="גיל מנהל הטיול"
                    inputMode="numeric"
                    onChange={(event) => setSetupDraft((draft) => ({ ...draft, memberAge: event.target.value }))}
                    placeholder="גיל"
                    value={setupDraft.memberAge}
                  />
                </label>
              </div>
              <div className={`source-feedback ${googleSourceRecognized ? "ready" : "waiting"}`}>
                <strong>{googleSourceRecognized ? "הקישור זוהה" : "מחכה למקור Google"}</strong>
                <p>
                  {googleSourceRecognized
                    ? "זה עדיין לא סנכרון חי מחשבון Google. OAuth יאפשר בהמשך לבחור מפה אמיתית מתוך החשבון."
                    : `${summary.total} נקודות טיול מוכנות אחרי חיבור מקור הטיול.`}
                </p>
                {googleSourcePreview ? (
                  <small className="google-source-preview">
                    Read-only preview active · {googleSourcePreview.source.placesWithCoordinates}/
                    {googleSourcePreview.source.importedPlacesCount} with coordinates · write-back requires Google OAuth
                  </small>
                ) : (
                  <small className="google-source-preview">Read-only preview active · write-back requires Google OAuth</small>
                )}
              </div>
              {!tripSourceStepReady ? (
                <small className="setup-error">כדי להמשיך צריך שם טיול, קישור Google Maps תקין, שם מנהל וגיל.</small>
              ) : null}
              <button
                className="primary-action"
                disabled={!tripSourceStepReady}
                type="button"
                onClick={() => setActivationStep("manager_location")}
              >
                המשך למיקום מנהל
              </button>
              <button className="quiet-action" type="button" onClick={() => setActivationStep("welcome")}>
                חזרה
              </button>
            </section>
          ) : null}

          {activationStep === "manager_location" ? (
            <section className="guided-step" aria-label="הפעלת מיקום מנהל">
              <span className="eyebrow">שלב 3 מתוך 4</span>
              <h2>נפעיל מיקום מנהל</h2>
              <p>
                זה הלב של קודי: מפה, נקודות הטיול והמיקום החי של מנהל הטיול. בלי זה קודי לא יודע באמת איפה אתם
                ביחס למסלול.
              </p>
              <div className={`location-status ${managerLocationReady ? "ready" : locationState}`}>
                <MapPin size={20} aria-hidden="true" />
                <div>
                  <strong>{managerLocationReady ? "מיקום מנהל פעיל במפה" : "ממתין להרשאת מיקום"}</strong>
                  <p>
                    {managerLocationReady
                      ? "קודי משתמש במיקום החי במפה כהקשר לשאלות פתוחות."
                      : "הדפדפן יבקש הרשאת מיקום. שאר חברי הקבוצה יחוברו בהמשך ובהסכמה נפרדת."}
                  </p>
                </div>
              </div>
              {managerLocationReady ? (
                <>
                  <button className="primary-action" type="button" onClick={() => setActivationStep("ready")}>
                    המשך למפה ולשיחה
                  </button>
                  <button
                    disabled={locationState === "requesting"}
                    className="quiet-action"
                    onClick={enablePersonalGps}
                    type="button"
                  >
                    {locationState === "requesting" ? "מרענן מיקום..." : "רענן מיקום"}
                  </button>
                </>
              ) : (
                <button disabled={locationState === "requesting"} className="primary-action" onClick={enablePersonalGps} type="button">
                  {locationState === "requesting" ? "מבקש הרשאת מיקום..." : "הפעל מיקום מנהל במפה"}
                </button>
              )}
              {locationState === "error" ? <small className="setup-error">לא קיבלתי מיקום. אפשר לנסות שוב מהדפדפן.</small> : null}
              <button className="quiet-action" type="button" onClick={() => setActivationStep("google")}>
                חזרה
              </button>
            </section>
          ) : null}

          {activationStep === "ready" ? (
            <section className="guided-step" aria-label="כניסה למפה ולשיחה">
              <span className="eyebrow">שלב 4 מתוך 4</span>
              <h2>הלב מוכן</h2>
              <p>עכשיו נכנסים למסך הראשי: קודי, מפה, נקודות הטיול ומיקום מנהל. שאר האפשרויות יישארו בצד ולא יעמיסו.</p>
              <div className="core-ready-grid">
                {readinessItems.map((item) => (
                  <span className={item.ready ? "ready" : "missing"} key={item.label}>
                    <CheckCircle2 size={15} aria-hidden="true" />
                    {item.label}
                  </span>
                ))}
              </div>
              <button disabled={!setupReady || setupSaveState === "saving"} className="primary-action" type="button" onClick={saveSetupAndStart}>
                {setupSaveState === "saving" ? "שומר..." : "כניסה למפה ולשיחה"}
              </button>
              <button className="quiet-action" type="button" onClick={() => setActivationStep("manager_location")}>
                חזרה
              </button>
              {setupSaveError ? <small className="setup-error">{setupSaveError}</small> : null}
            </section>
          ) : null}
        </aside>
      </main>
    );
  }

  return (
    <main className={`app-shell ${secondaryMenuOpen ? "secondary-menu-visible" : ""}`}>
      <section className="map-surface" aria-label="מפת הטיול">
        <div className="top-bar">
          <button
            aria-expanded={secondaryMenuOpen}
            className="icon-button"
            aria-label="תפריט"
            onClick={() => setSecondaryMenuOpen((isOpen) => !isOpen)}
            type="button"
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <div>
            <h1>{demoTripSummary.name}</h1>
            <p>
              {summary.total} נקודות · {demoTripSummary.groupName}
            </p>
          </div>
          <button
            aria-label="מיקום נוכחי"
            className={locationState === "enabled" || currentLocation ? "current-location-button active" : "current-location-button"}
            disabled={locationState === "requesting"}
            onClick={enablePersonalGps}
            title={currentLocation ? "עדכן מיקום נוכחי" : "הפעל מיקום נוכחי"}
            type="button"
          >
            <Navigation size={17} aria-hidden="true" />
            <span>{locationState === "requesting" ? "מאתר..." : "מיקום נוכחי"}</span>
          </button>
        </div>

        <div className={`map-placeholder ${googleMapsApiKey ? "google-map-active" : "internal-map-fallback"}`}>
          <div className="google-map-canvas" ref={googleMapElementRef} aria-label="Google Maps" />
          <button className="open-google-maps-button" onClick={openCurrentMapInGoogleMaps} type="button">
            <ExternalLink size={16} aria-hidden="true" />
            <span>פתח Google Maps</span>
          </button>
          <Radio size={34} aria-hidden="true" />
          <span>מפה חיה</span>
          <small>
            {summary.lodgingCount} לינות · {summary.waterCount} נקודות מים ·{" "}
            {loadState === "ready" ? "מחובר לחשבון הטיול" : "מכין את נתוני הטיול"}
          </small>
          <small className="map-focus-summary">{mapFocusSummary}</small>
          <div className={`map-provider-note ${mapProviderStatus.mode}`}>
            <strong>{mapProviderStatus.label}</strong>
            <p>{mapProviderStatus.detail}</p>
          </div>
          <div className="trip-map-layer" aria-label="שכבות מפת הטיול">
            {visiblePlaces.map((place, index) => (
              <button
                className={`place-marker ${place.id === selectedPlace?.id ? "selected-place-marker" : ""}`}
                key={place.id}
                onClick={() => setSelectedPlaceId(place.id)}
                style={getMapPosition(index, visiblePlaces.length)}
                type="button"
              >
                <MapPin size={14} aria-hidden="true" />
                <span>{place.name}</span>
              </button>
            ))}
            {currentLocation ? (
              <div className="self-marker" style={{ left: "50%", top: "50%" }}>
                <Navigation size={15} aria-hidden="true" />
                <span>אני כאן</span>
              </div>
            ) : null}
          </div>
          <div className="group-location-layer" aria-label="מיקומי חברי קבוצה">
            {visibleMembers.map((member, index) => (
              <button className={`member-marker marker-${index}`} key={member.id} type="button">
                <MapPin size={15} aria-hidden="true" />
                <span>{member.name}</span>
                <small>{member.liveLocation?.updatedMinutesAgo} דק׳</small>
              </button>
            ))}
          </div>
          <div className="privacy-note">
            מיקום חברי קבוצה מוצג רק למי שאישר שיתוף ·{" "}
            {memberRealtimeState === "live"
              ? "סנכרון חי פעיל"
              : memberRealtimeState === "error"
                ? "סנכרון חי ממתין לחיבור"
                : "מכין סנכרון חי"}
          </div>
          <div className="personal-location-card" aria-label="מיקום חי במפה">
            <strong>מיקום חי במפה</strong>
            {currentLocation ? (
              <p>
                מיקום חי על Google Maps · דיוק {Math.round(currentLocation.accuracyMeters ?? 0)} מ'
              </p>
            ) : (
              <p>כבוי · נדרש אישור בדפדפן</p>
            )}
            <button disabled={locationState === "requesting"} onClick={enablePersonalGps} type="button">
              {locationState === "requesting" ? "מבקש הרשאה..." : "הפעל מיקום במפה"}
            </button>
            {locationState === "error" ? <small>לא הצלחתי לקבל מיקום. אפשר להמשיך בלי לשתף מיקום.</small> : null}
            {locationSyncState === "synced" ? <small>המיקום סונכרן עבור {activeMember.name}</small> : null}
            {locationSyncState === "blocked" ? <small>לא סונכרן כי לחבר הזה אין הסכמת שיתוף.</small> : null}
            {locationSyncState === "error" ? <small>המיקום פעיל, אבל סנכרון המיקום לשרת נכשל.</small> : null}
          </div>
        </div>

        <div className="kodi-presence" aria-label="נוכחות קודי">
          קודי ברקע · מתעורר כשקוראים לו
        </div>
      </section>

      <aside className="secondary-menu" aria-label="ניהול הטיול">
        <div className="secondary-menu-header">
          <strong>ניהול</strong>
          <button onClick={() => setSecondaryMenuOpen(false)} type="button">
            סגור
          </button>
        </div>
        <section className="menu-block trip-places-menu" aria-label="כל נקודות הטיול">
          <strong>נקודות הטיול</strong>
          <p>
            {placeListFilter === "route"
              ? `${menuPlaces.length} נקודות לפי סדר המסלול`
              : placeListFilter === "nearby" && mapAnchorLocation
                ? `${menuPlaces.length} נקודות מסודרות לפי קרבה למיקום הנוכחי`
                : placeListFilter === "nearby"
                  ? `${menuPlaces.length} נקודות מסודרות לפי סדר המסלול עד שיאושר מיקום`
                  : `${menuPlaces.length} מתוך ${places.length} נקודות בתוכנית הטיול`}
          </p>
          <div className="place-filter-chips" aria-label="סינון נקודות טיול">
            {placeListFilters.map((filter) => (
              <button
                className={placeListFilter === filter.value ? "active-place-filter" : ""}
                key={filter.value}
                onClick={() => setPlaceListFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="trip-place-list">
            {menuPlaces.length > 0 ? (
              menuPlaces.map((place) => {
                const hasCoordinates = typeof place.lat === "number" && typeof place.lng === "number";
                const distanceLabel = formatDistanceKm(getPlaceDistanceKm(place, mapAnchorLocation));
                const isExpanded = expandedPlaceId === place.id;
                const isSelected = place.id === selectedPlace?.id;
                const cleanNote = place.note?.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
                const shouldShowNote = Boolean(cleanNote && cleanNote !== place.address);
                return (
                  <article className={isSelected ? "trip-place-card selected-trip-place" : "trip-place-card"} key={place.id}>
                    <button className="trip-place-main" onClick={() => focusPlaceOnMap(place)} type="button">
                      <span>{place.name}</span>
                      <small>
                        {getPlaceTypeLabel(place.type)}
                        {distanceLabel ? ` · ${distanceLabel}` : ""}
                        {hasCoordinates ? " · במפה" : " · ברשימה"}
                      </small>
                    </button>
                    <p>{getPlaceCardSummary(place)}</p>
                    {isExpanded ? (
                      <div className="trip-place-details">
                        {shouldShowNote ? <span>{cleanNote}</span> : null}
                        {place.address ? <span>{place.address}</span> : null}
                        <span>{hasCoordinates ? "יש מיקום שמור במפה" : "אין מיקום שמור במפה"}</span>
                      </div>
                    ) : null}
                    <div className="trip-place-actions" aria-label={`פעולות עבור ${place.name}`}>
                      <button disabled={!hasCoordinates || navigationState === "opening"} onClick={() => openPlaceNavigation(place, "maps")} type="button">
                        <MapPin size={14} aria-hidden="true" />
                        מפה
                      </button>
                      <button disabled={!hasCoordinates || navigationState === "opening"} onClick={() => openPlaceNavigation(place, "waze")} type="button">
                        <Navigation size={14} aria-hidden="true" />
                        Waze
                      </button>
                      <button
                        className={isExpanded ? "active-place-detail" : ""}
                        onClick={() => setExpandedPlaceId(isExpanded ? null : place.id)}
                        type="button"
                      >
                        פרטים
                      </button>
                      <button onClick={() => prepareKodiPlaceQuestion(place)} type="button">
                        <Sparkles size={14} aria-hidden="true" />
                        קודי
                      </button>
                      <button className="remove-place-action" onClick={() => removePlaceFromRoute(place)} type="button">
                        <Trash2 size={14} aria-hidden="true" />
                        הסר
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="empty-trip-place-list">אין נקודות במסנן הזה.</div>
            )}
          </div>
        </section>
        <section className="menu-block invite-menu" data-consent-model="per-device-location-consent" data-invite-model="whatsapp-style-share-link">
          <strong>הזמנת משתתפים</strong>
          <p>שלחו קישור כמו בקבוצת וואטסאפ. מי שמקבל נכנס, כותב שם, מאשר מיקום ומצטרף.</p>
          <input aria-label="קישור הזמנה בתפריט ניהול" dir="ltr" readOnly value={tripInviteUrl} />
          <div className="invite-menu-actions">
            <button disabled={inviteShareState === "sharing"} onClick={shareTripInvite} type="button">
              <Share2 size={16} aria-hidden="true" />
              {inviteShareState === "sharing" ? "פותח שיתוף..." : "שתף הזמנה"}
            </button>
            <button className="secondary-menu-action" onClick={copyTripInviteLink} type="button">
              העתק קישור
            </button>
          </div>
          {inviteShareState === "shared" ? <small>ההזמנה נשלחה</small> : null}
          {inviteShareState === "copied" ? <small>הקישור הועתק</small> : null}
          {inviteShareState === "error" ? <small>לא הצלחתי לשתף. אפשר להעתיק קישור.</small> : null}
          {inviteCopyState === "copied" ? <small>הקישור הועתק</small> : null}
          {inviteCopyState === "error" ? <small>לא הצלחתי להעתיק. אפשר לסמן ולהעתיק ידנית.</small> : null}
        </section>
        <section className="menu-block members-menu" aria-label="ניהול חברי הקבוצה">
          <strong>חברי הקבוצה</strong>
          <p>הצטרפות פשוטה: שם, גיל ואישור מיקום מהמכשיר. הסוכן, המפה וההרשאות נשארים תחת מנהל הטיול.</p>
          <div className="member-management-list">
            {members.map((member) => (
              <article key={member.id}>
                <span>
                  {member.name}
                  {member.id === activeMember.id ? " · אני" : ""}
                </span>
                <small>{member.role === "owner" ? "מנהל" : member.role === "admin" ? "מנהל נוסף" : "משתתף"}</small>
                {activeMember.id !== member.id && (activeMember.role === "owner" || activeMember.role === "admin") && member.role !== "owner" ? (
                  <button disabled={memberActionState === "working"} onClick={() => removeTripMember(member.id)} type="button">
                    הסר משתתף
                  </button>
                ) : null}
              </article>
            ))}
          </div>
          {activeMember.role !== "owner" ? (
            <button className="danger-menu-action" disabled={memberActionState === "working"} onClick={leaveTripGroup} type="button">
              יציאה מהקבוצה
            </button>
          ) : (
            <small>מנהל הטיול לא יוצא מהקבוצה; הוא יכול להסיר משתתפים ולשלוח הזמנות.</small>
          )}
          {memberActionState === "error" ? <small>לא הצלחתי לעדכן את הקבוצה כרגע.</small> : null}
        </section>
        <section className="menu-block trip-map-source-menu" aria-label="מפות הטיול שלי">
          <strong>מפות הטיול שלי</strong>
          <p>מנהל הטיול יכול להחליף את מקור המפה הפעיל. משתתפים רגילים לא משנים את נקודות הטיול.</p>
          <div className="trip-map-source-current">
            <span>פעיל עכשיו</span>
            <strong>{setupDraft.tripName || "צפון יוון"}</strong>
            <small>{setupDraft.googleLink || "Google Maps trip list"}</small>
          </div>
          <input
            aria-label="שם מפת טיול חדשה"
            onChange={(event) => setMapSwitchDraft((draft) => ({ ...draft, name: event.target.value }))}
            placeholder="שם הטיול, למשל אוסטריה"
            value={mapSwitchDraft.name}
          />
          <input
            aria-label="קישור Google Maps למפת טיול חדשה"
            dir="ltr"
            onChange={(event) => setMapSwitchDraft((draft) => ({ ...draft, googleLink: event.target.value }))}
            placeholder="https://maps.app.goo.gl/..."
            value={mapSwitchDraft.googleLink}
          />
          <button
            disabled={mapSwitchState === "working" || !(activeMember.role === "owner" || activeMember.role === "admin")}
            onClick={requestTripMapSwitch}
            type="button"
          >
            {mapSwitchState === "working" ? "מחליף מקור..." : "החלף מפת טיול"}
          </button>
          {mapSwitchMessage ? <small>{mapSwitchMessage}</small> : null}
          {activeMember.role === "owner" || activeMember.role === "admin" ? null : <small>רק מנהל טיול יכול להחליף מפה לכל הקבוצה.</small>}
          <small>הקישור נשמר כמקור הפעיל. ייבוא אוטומטי של נקודות ממפות פרטיות דורש חיבור Google OAuth.</small>
        </section>
        <section className="menu-block location-menu">
          <strong>מיקום בטלפון</strong>
          <p>{currentLocation ? `פעיל על Google Maps · דיוק ${Math.round(currentLocation.accuracyMeters ?? 0)} מ'` : "כדי שקודי ידע איפה אתם, צריך לאשר מיקום במכשיר הזה."}</p>
          <button disabled={locationState === "requesting"} onClick={enablePersonalGps} type="button">
            {locationState === "requesting" ? "מבקש הרשאה..." : currentLocation ? "רענן מיקום" : "אשר מיקום"}
          </button>
        </section>
        <section className="menu-block external-apps-menu">
          <strong>קישורים חיצוניים</strong>
          <p>יציאה מהירה לכלים המקוריים: Google Maps, Booking, Airbnb וקיצורים אישיים.</p>
          <div className="external-shortcuts menu-shortcuts" aria-label="קיצורי אפליקציות חיצוניות בתפריט">
            {externalShortcuts.map((shortcut) => (
              <a href={shortcut.href} key={shortcut.label} rel="noreferrer" target="_blank">
                <ExternalLink size={14} aria-hidden="true" />
                {shortcut.label}
              </a>
            ))}
            {userShortcuts.map((shortcut) => (
              <a href={shortcut.url} key={shortcut.id} rel="noreferrer" target="_blank">
                <ExternalLink size={14} aria-hidden="true" />
                {shortcut.label}
              </a>
            ))}
          </div>
          <form className="shortcut-form menu-shortcut-form" onSubmit={addUserShortcut}>
            <input
              aria-label="שם קיצור אישי"
              onChange={(event) => setShortcutLabelDraft(event.target.value)}
              placeholder="שם קיצור"
              value={shortcutLabelDraft}
            />
            <input
              aria-label="כתובת קיצור אישי"
              dir="ltr"
              onChange={(event) => setShortcutUrlDraft(event.target.value)}
              placeholder="https://..."
              value={shortcutUrlDraft}
            />
            <button type="submit">הוסף</button>
          </form>
        </section>
        <section className="menu-block install-menu" aria-label="התקנת קודי במסך הבית">
          <strong>קודי במסך הבית</strong>
          <p>
            {installState === "installed"
              ? "קודי כבר פעיל כקיצור אפליקציה."
              : installPrompt
                ? "הוסף את קודי כאייקון כמו אפליקציה בטלפון."
                : "אם הדפדפן לא מציג התקנה, פתח את תפריט הדפדפן ובחר הוסף למסך הבית."}
          </p>
          <button disabled={installState === "installed"} onClick={installKodiShortcut} type="button">
            <Download size={18} aria-hidden="true" />
            {installState === "installed" ? "כבר מותקן" : "התקן את קודי"}
          </button>
        </section>
        <details className="advanced-menu">
          <summary>אפשרויות נוספות</summary>
          <section className="menu-block event-menu event-activity" aria-label="פעילות חיה בקבוצה">
          <strong>פעילות חיה</strong>
          <p>
            {eventRealtimeState === "live"
              ? eventLogDriver === "supabase"
                ? "סנכרון פעיל"
                : "סנכרון מקומי"
              : eventRealtimeState === "error"
                ? "ממתין לחיבור"
                : "מכין סנכרון"}
          </p>
          <div className="event-items">
            {recentTripEvents.length > 0 ? (
              recentTripEvents.map((event) => (
                <article key={event.id}>
                  <span>{getTripEventLabel(event.eventType)}</span>
                  <p>{getTripEventText(event)}</p>
                </article>
              ))
            ) : (
              <article>
                <span>מערכת</span>
                <p>קודי מחכה לפעילות ראשונה בקבוצה</p>
              </article>
            )}
          </div>
          </section>
          <section className="menu-block">
          <strong>בקרת קודי</strong>
          <p>{usageAuditOverview.totalAuthorizedCalls} פעולות נרשמו בטיול הזה.</p>
          <div className="usage-overview-grid">
            <span>
              <strong>{usageAuditOverview.googlePlacesCalls}</strong>
              Google Places
            </span>
            <span>
              <strong>{usageAuditOverview.googleRoutesCalls}</strong>
              Google Routes
            </span>
            <span>
              <strong>{usageAuditOverview.kodiAgentCalls}</strong>
              דרך קודי
            </span>
            <span>
              <strong>{usageAuditOverview.directApiCalls}</strong>
              API ישיר
            </span>
          </div>
          </section>
        </details>
      </aside>

      <aside className="chat-sheet" aria-label="שיחת המשפחה">
        <header>
          <div>
            <h2>קבוצת הטיול</h2>
            <p>קודי הוא משתתף בשיחה. הוא קורא הקשר, מציע פשרה, ופעולות שינוי דורשות מנהל.</p>
            <small className="chat-sync-status">
              {chatRealtimeState === "live"
                ? "שיחה מסונכרנת"
                : chatRealtimeState === "error"
                  ? "סנכרון שיחה ממתין לחיבור"
                  : "מכין סנכרון שיחה"}
            </small>
          </div>
          <div className="member-pills" aria-label="חברי קבוצה">
            {members.map((member, index) => (
              <button
                className={`${member.locationSharing === "enabled" ? "sharing-on" : "sharing-off"} ${
                  activeMember.id === member.id ? "active-speaker" : ""
                }`}
                key={member.id}
                onClick={() => setActiveMemberId(member.id)}
                type="button"
              >
                {index === 0 ? <Users size={13} aria-hidden="true" /> : null}
                {member.name}
              </button>
            ))}
            <span className="kodi-pill">קודי</span>
          </div>
          <div className="active-speaker-note">כותבים עכשיו בשם {activeMember.name}</div>
        </header>

        <div className="messages" aria-live="polite" onScroll={updateMessageScrollIntent} ref={messagesContainerRef}>
          {messages.map((message, index) => (
            <article
              className={`message${message.author === "קודי" ? " kodi" : ""}${
                message.author === activeMember.name ? " current-user" : ""
              }`}
              key={`${message.author}-${index}-${message.text}`}
            >
              <div className="message-header">
                <strong>{message.author}</strong>
                {message.author === "קודי" ? (
                  <button
                    aria-label={speakingMessageId === (message.id ?? `${message.author}-${index}`) ? "עצור הקראה" : "קודי הקריא בקול"}
                    aria-pressed={speakingMessageId === (message.id ?? `${message.author}-${index}`)}
                    className={
                      speakingMessageId === (message.id ?? `${message.author}-${index}`)
                        ? speechOutputState === "preparing"
                          ? "speak-message-button preparing"
                          : "speak-message-button speaking"
                        : "speak-message-button"
                    }
                    onClick={() =>
                      speakingMessageId === (message.id ?? `${message.author}-${index}`)
                        ? stopKodiSpeech()
                        : speakKodiMessage(message.text, message.id ?? `${message.author}-${index}`)
                    }
                    title={
                      speechOutputState === "unsupported"
                        ? "הדפדפן לא תומך בהקראה"
                        : speechOutputState === "error"
                          ? "לא הצלחתי להקריא כרגע"
                          : "קודי הקריא בקול"
                    }
                    type="button"
                  >
                    {speakingMessageId === (message.id ?? `${message.author}-${index}`) && speechOutputState === "preparing" ? (
                      <>
                        <Volume2 size={16} aria-hidden="true" />
                        <span>מכין</span>
                      </>
                    ) : speakingMessageId === (message.id ?? `${message.author}-${index}`) ? (
                      <>
                        <VolumeX size={16} aria-hidden="true" />
                        <span>עוצר</span>
                      </>
                    ) : (
                      <>
                        <Volume2 size={16} aria-hidden="true" />
                        <span>הקרא</span>
                      </>
                    )}
                  </button>
                ) : null}
              </div>
              <p>{renderMessageText(message.text)}</p>
            </article>
          ))}
          {isKodiThinking ? (
            <article className="message kodi thinking" aria-live="polite" role="status">
              <div className="message-header">
                <strong>קודי</strong>
              </div>
              <div className="kodi-thinking-pulse" aria-label="קודי חושב">
                <span />
                <span />
                <span />
              </div>
            </article>
          ) : null}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>

        <form
          className={`${speechState === "listening" ? "composer voice-listening" : "composer"}${
            voiceConversationActive ? " voice-conversation-active" : ""
          }`}
          onSubmit={sendMessageWithPersistence}
        >
          <button
            aria-pressed={voiceConversationActive}
            className="voice-conversation-toggle"
            onClick={toggleVoiceConversation}
            title={
              speechState === "unsupported"
                ? "הדפדפן הזה לא תומך בדיבור"
                : voiceConversationActive
                  ? "עצור שיחה קולית עם קודי"
                  : "התחל שיחה קולית רציפה עם קודי"
            }
            type="button"
          >
            <Radio size={17} aria-hidden="true" />
            <span>{voiceConversationActive ? "עצור שיחה" : "שיחה קולית"}</span>
          </button>
          {speechState === "listening" ? (
            <div className="voice-recording-indicator" aria-live="assertive" role="status">
              <span className="recording-dot" aria-hidden="true" />
              <span>מקליט... שחרור שולח</span>
            </div>
          ) : null}
          <input
            aria-label="כתיבת הודעה לקבוצה"
            onChange={(event) => setDraft(event.target.value)}
            placeholder=""
            value={draft}
          />
          <button
            aria-label={speechState === "listening" ? "שחרור שולח הודעה קולית" : "לחץ והחזק כדי לדבר"}
            className={speechState === "listening" ? "voice-button listening" : "voice-button"}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if ((event.key === " " || event.key === "Enter") && speechState !== "listening") {
                event.preventDefault();
                startVoiceInput();
              }
            }}
            onKeyUp={(event) => {
              if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                finishVoiceInput();
              }
            }}
            onPointerCancel={cancelVoiceInput}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture?.(event.pointerId);
              startVoiceInput();
            }}
            onPointerUp={(event) => {
              event.preventDefault();
              event.currentTarget.releasePointerCapture?.(event.pointerId);
              finishVoiceInput();
            }}
            title={
              speechState === "unsupported"
                ? "הדפדפן הזה לא תומך בדיבור"
                : speechState === "error"
                  ? "לא הצלחתי להפעיל דיבור"
                  : "לחץ והחזק. שחרור שולח את ההודעה"
            }
            type="button"
          >
            <Mic size={18} aria-hidden="true" />
          </button>
          <button type="submit">שלח</button>
        </form>
      </aside>
    </main>
  );
}
