import { CheckCircle2, ExternalLink, MapPin, Menu, Navigation, Radio, ShieldCheck, Sparkles, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { demoMembers, demoMessages, demoPlaces, demoTripSummary } from "./demoTrip.js";

type PlaceType = "lodging" | "attraction" | "water" | "food" | "transport" | "stop" | "unknown";
type ActivationStep = "welcome" | "google" | "manager_location" | "ready";

interface TripPlace {
  id: string;
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
const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? "";

function getMapProviderStatus() {
  if (googleMapsApiKey) {
    return {
      mode: "google-ready" as const,
      label: "Google Maps JS מוגדר",
      detail: "נמצא API key; שכבת Google תחובר כאן בלי לשנות את הלוגיקה"
    };
  }

  return {
    mode: "internal-fallback" as const,
    label: "שכבת מפה פנימית",
    detail: "חסר Google Maps API key; מציגים fallback שמחבר נקודות, GPS וקבוצה"
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
  const labels: Record<TripEvent["eventType"], string> = {
    message_created: "הודעה",
    location_updated: "מיקום",
    destination_set: "יעד",
    route_created: "מסלול",
    route_progressed: "התקדמות",
    setup_updated: "קליטה",
    system: "מערכת"
  };

  return labels[eventType];
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

function buildKodiFallbackReply(messages: ChatMessage[], selectedPlace?: TripPlace) {
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
    return `שמעתי שיש פה שני צרכים: משהו מתוק, וגם לא להתרחק כי נועה עייפה. הייתי מחפש נקודה קלה ליד ${selected}, עם מינימום הליכה. אני יכול להציע מקום, ואז אבקש אישור לפני שינוי יעד קבוצתי.`;
  }

  if (recentText.includes("איפה") || recentText.includes("כולם")) {
    return "אני מסתכל על ההקשר של הקבוצה. כשנחבר מיקום חי, אוכל להגיד מי קרוב למי ולהציע נקודת מפגש נוחה בלי לחשוף מיקום של מי שלא אישר שיתוף.";
  }

  return "אני כאן בשיחה. קראתי את ההודעות האחרונות, ואם תרצו אעזור למצוא מכנה משותף ולהפוך את זה להחלטה פשוטה: המלצה, הסבר וניווט.";
}

function getMapPosition(index: number, total: number) {
  const angle = total > 0 ? (index / total) * Math.PI * 2 : 0;
  const radius = 20 + (index % 3) * 7;

  return {
    left: `${50 + Math.cos(angle) * radius}%`,
    top: `${50 + Math.sin(angle) * radius}%`
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
  const [showActivation, setShowActivation] = useState(!initialJoinToken);
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
  const [summary, setSummary] = useState<TripPlacesSummary>({
    total: demoTripSummary.totalPlaces,
    lodgingCount: demoTripSummary.lodgingCount,
    waterCount: demoTripSummary.waterCount,
    byType: {}
  });
  const [places, setPlaces] = useState<TripPlace[]>(demoPlaces);
  const [selectedPlaceId, setSelectedPlaceId] = useState(demoPlaces[0]?.id ?? "");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "fallback">("loading");
  const [navigationState, setNavigationState] = useState<"idle" | "opening" | "error">("idle");
  const [messages, setMessages] = useState<ChatMessage[]>(demoMessages);
  const [tripEvents, setTripEvents] = useState<TripEvent[]>([]);
  const [eventRealtimeState, setEventRealtimeState] = useState<"idle" | "live" | "error">("idle");
  const [eventLogDriver, setEventLogDriver] = useState<"file" | "supabase" | "unknown">("unknown");
  const [members, setMembers] = useState<DemoMember[]>(demoMembers as DemoMember[]);
  const [activeMemberId, setActiveMemberId] = useState("mom");
  const [draft, setDraft] = useState("");
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
                description: "GPS ושיתוף מיקום רק בהסכמה מפורשת."
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

        setSummary(data.summary);
        setPlaces(data.places);
        setSelectedPlaceId(data.places[0]?.id ?? "");
        setMembers(mapMemberLocations(data.members));
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
          }))
        );
      } catch {
        if (!ignore) {
          setMembers(demoMembers as DemoMember[]);
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
          setMessages(data.messages);
        }
      } catch {
        if (!ignore) {
          setMessages(demoMessages);
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

        setMessages(data.messages);
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
            setMessages(data.messages);
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

        setMembers(mapMemberLocations(data.members));
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
            setMembers(mapMemberLocations(data.members));
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

    return [...places].sort((first, second) => priority[first.type] - priority[second.type]).slice(0, 5);
  }, [places]);

  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? visiblePlaces[0];
  const canNavigate = typeof selectedPlace?.lat === "number" && typeof selectedPlace?.lng === "number";
  const externalShortcuts = buildExternalAppShortcuts(selectedPlace);
  const mapProviderStatus = getMapProviderStatus();
  const tripInviteUrl =
    typeof window === "undefined"
      ? "https://kodi-travel-companion.onrender.com?join=group_family_greece_demo"
      : `${window.location.origin}${window.location.pathname}?join=group_family_greece_demo`;
  const activeMember = members.find((member) => member.id === activeMemberId) ?? members[0] ?? {
    id: "mom",
    name: "אמא",
    role: "owner",
    ageGroup: "adult",
    locationSharing: "enabled",
    liveLocation: null
  };
  const visibleMembers = members.filter((member) => member.locationSharing === "enabled" && member.liveLocation);
  const managerMember = members.find((member) => member.role === "owner" || member.role === "admin") ?? activeMember;
  const recentTripEvents = tripEvents.slice(0, 3);
  const usageAuditOverview = useMemo(() => buildUsageAuditOverview(tripEvents), [tripEvents]);
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

  async function openSelectedPlaceInWaze() {
    if (!selectedPlace || !canNavigate) {
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
          lat: selectedPlace.lat,
          lng: selectedPlace.lng,
          label: selectedPlace.name
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

  async function requestKodiReply(text: string, nextMessages: ChatMessage[]) {
    try {
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
          recentMessages: nextMessages.slice(-8),
          context: {
            permissionPolicy: {
              operationalChangesRequireAdmin: true,
              canShareLiveLocation: false
            },
            currentLocation: currentLocation ? { lat: currentLocation.lat, lng: currentLocation.lng } : undefined
          },
          selectedPlace
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

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();
    if (!text) {
      return;
    }

    const nextMessages = [...messages, { author: activeMember.name, text }];
    const shouldWakeKodi = text.includes("קודי");

    setDraft("");
    setMessages(nextMessages);

    if (shouldWakeKodi) {
      const reply = await requestKodiReply(text, nextMessages);
      setMessages((currentMessages) => [...currentMessages, { author: "קודי", text: reply }]);
    }
  }

  async function sendMessageWithPersistence(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const text = draft.trim();
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
    const shouldWakeKodi = text.includes("קודי") || text.includes("׳§׳•׳“׳™");

    setDraft("");
    setMessages(nextMessages);

    const savedUserMessage = await persistChatMessage(localUserMessage);
    setMessages((currentMessages) =>
      currentMessages.map((message) => (message.id === localUserMessage.id ? savedUserMessage : message))
    );

    if (shouldWakeKodi) {
      const reply = await requestKodiReply(text, nextMessages);
      const localKodiMessage: ChatMessage = {
        id: `local-kodi-${Date.now()}`,
        author: "קודי",
        text: reply,
        source: "agent",
        createdAt: new Date().toISOString()
      };

      setMessages((currentMessages) => [...currentMessages, localKodiMessage]);

      const savedKodiMessage = await persistChatMessage(localKodiMessage);
      setMessages((currentMessages) =>
        currentMessages.map((message) => (message.id === localKodiMessage.id ? savedKodiMessage : message))
      );
    }
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

  function joinTripFromInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = joinDraft.name.trim();
    if (name.length < 2) {
      return;
    }

    const nextMember: DemoMember = {
      id: `guest-${Date.now()}`,
      name,
      role: "member",
      ageGroup: getAgeGroupFromDraft(joinDraft.age),
      locationSharing: "disabled",
      liveLocation: null
    };

    setMembers((currentMembers) => [...currentMembers, nextMember]);
    setActiveMemberId(nextMember.id);
    setShowJoinFlow(false);
    setShowActivation(false);
    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: `local-join-${Date.now()}`,
        author: "קודי",
        text: `${name} הצטרף/ה לקבוצת הטיול. מיקום אישי יוצג רק אחרי אישור GPS מהמכשיר שלו/שלה.`,
        source: "system",
        createdAt: new Date().toISOString()
      }
    ]);
  }

  function enablePersonalGps() {
    if (!("geolocation" in navigator)) {
      setLocationState("error");
      return;
    }

    setLocationState("requesting");
    navigator.geolocation.getCurrentPosition(
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
                          label: payload.member.displayLabel ?? "GPS אישי",
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
        maximumAge: 60_000,
        timeout: 10_000
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
              גיל
              <input
                aria-label="גיל משתתף להצטרפות"
                inputMode="numeric"
                onChange={(event) => setJoinDraft((draft) => ({ ...draft, age: event.target.value }))}
                placeholder="לדוגמה 12"
                value={joinDraft.age}
              />
            </label>
            <button disabled={joinDraft.name.trim().length < 2} type="submit">
              הצטרפות לקבוצה
            </button>
          </form>
          <div className="join-consent-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <p>אישור מיקום נעשה בנפרד מהמכשיר שלך. בלי אישור GPS, אפשר עדיין להשתתף בשיחה עם קודי.</p>
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
                <strong>אפשר לשאול אותי כמעט הכול</strong>
                <p>בית חב"ד קרוב, גלידה, תחנת דלק, חוף יפה, זמן נסיעה, או מה כדאי לעשות עכשיו.</p>
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
                    placeholder="לדוגמה: טיול צפון יוון"
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
                    placeholder="לדוגמה: אבא"
                    value={setupDraft.memberName}
                  />
                </label>
                <label>
                  גיל מנהל הטיול
                  <input
                    aria-label="גיל מנהל הטיול"
                    inputMode="numeric"
                    onChange={(event) => setSetupDraft((draft) => ({ ...draft, memberAge: event.target.value }))}
                    placeholder="לדוגמה: 40"
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
                  <strong>{managerLocationReady ? "מיקום מנהל פעיל" : "ממתין להרשאת GPS"}</strong>
                  <p>
                    {managerLocationReady
                      ? "קודי יוכל להשתמש במיקום הזה כהקשר לשאלות פתוחות."
                      : "הדפדפן יבקש הרשאת מיקום. שאר חברי הקבוצה יחוברו בהמשך ובהסכמה נפרדת."}
                  </p>
                </div>
              </div>
              <button disabled={locationState === "requesting"} className="primary-action" onClick={enablePersonalGps} type="button">
                {locationState === "requesting" ? "מבקש הרשאת מיקום..." : managerLocationReady ? "רענן מיקום" : "הפעל GPS מנהל"}
              </button>
              <button
                className="quiet-action"
                disabled={!managerLocationReady}
                type="button"
                onClick={() => setActivationStep("ready")}
              >
                המשך
              </button>
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
    <main className="app-shell">
      <section className="map-surface" aria-label="מפת הטיול">
        <div className="top-bar">
          <button className="icon-button" aria-label="תפריט">
            <Menu size={22} aria-hidden="true" />
          </button>
          <div>
            <h1>{demoTripSummary.name}</h1>
            <p>
              {summary.total} נקודות · {demoTripSummary.groupName}
            </p>
          </div>
        </div>

        <div className="map-placeholder">
          <Radio size={34} aria-hidden="true" />
          <span>מפה חיה</span>
          <small>
            {summary.lodgingCount} לינות · {summary.waterCount} נקודות מים ·{" "}
            {loadState === "ready" ? "מחובר לחשבון הטיול" : "מכין את נתוני הטיול"}
          </small>
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
          <div className="personal-location-card" aria-label="GPS אישי">
            <strong>GPS אישי</strong>
            {currentLocation ? (
              <p>
                פעיל · דיוק {Math.round(currentLocation.accuracyMeters ?? 0)} מ'
              </p>
            ) : (
              <p>כבוי · נדרש אישור בדפדפן</p>
            )}
            <button disabled={locationState === "requesting"} onClick={enablePersonalGps} type="button">
              {locationState === "requesting" ? "מבקש הרשאה..." : "הפעל GPS"}
            </button>
            {locationState === "error" ? <small>לא הצלחתי לקבל מיקום. אפשר להמשיך בלי לשתף GPS.</small> : null}
            {locationSyncState === "synced" ? <small>המיקום סונכרן עבור {activeMember.name}</small> : null}
            {locationSyncState === "blocked" ? <small>לא סונכרן כי לחבר הזה אין הסכמת שיתוף.</small> : null}
            {locationSyncState === "error" ? <small>GPS פעיל, אבל סנכרון המיקום לשרת נכשל.</small> : null}
          </div>
        </div>

        <section className="places-strip" aria-label="נקודות מהטיול">
          {visiblePlaces.map((place) => (
            <article
              className={place.id === selectedPlace?.id ? "selected" : ""}
              key={place.id}
              onClick={() => setSelectedPlaceId(place.id)}
            >
              <strong>{place.name}</strong>
              <span>{getPlaceTypeLabel(place.type)}</span>
              <p>{place.note ?? place.address ?? "נקודה מיובאת ממפת הטיול"}</p>
            </article>
          ))}
        </section>

        {selectedPlace ? (
          <section className="action-card" aria-label="פעולה לנקודה נבחרת">
            <div>
              <span>{getPlaceTypeLabel(selectedPlace.type)}</span>
              <strong>{selectedPlace.name}</strong>
              <p>{canNavigate ? "אפשר לפתוח ניווט ישיר לנקודה." : "לנקודה הזו חסרות קואורדינטות."}</p>
            </div>
            <button disabled={!canNavigate || navigationState === "opening"} onClick={openSelectedPlaceInWaze} type="button">
              <Navigation size={18} aria-hidden="true" />
              פתח ב-Waze
            </button>
            <button
              className="secondary-action"
              disabled={actionApprovalState === "checking"}
              onClick={requestGroupDestinationApproval}
              type="button"
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              בקש להפוך ליעד קבוצתי
            </button>
            <small className="action-approval-status">
              {actionApprovalState === "approved"
                ? "אושר על ידי מנהל/ת ונשמר בשיחה."
                : actionApprovalState === "blocked"
                  ? "נדרש מנהל/ת כדי לשנות יעד קבוצתי."
                  : actionApprovalState === "error"
                    ? "לא הצלחתי לבדוק הרשאה כרגע."
                    : actionApprovalState === "checking"
                      ? "בודק הרשאות מול השרת..."
                      : "פעולה קבוצתית תיבדק מול הרשאות השרת."}
            </small>
            {groupDestination ? (
              <div className="group-destination-card" aria-label="יעד קבוצתי נוכחי">
                <span>יעד קבוצתי נוכחי</span>
                <strong>{groupDestination.placeName}</strong>
                <small className="destination-sync-status">
                  {destinationRealtimeState === "live"
                    ? "יעד מסונכרן"
                    : destinationRealtimeState === "error"
                      ? "סנכרון יעד ממתין לחיבור"
                      : "מכין סנכרון יעד"}
                </small>
                <small>נקבע על ידי {groupDestination.setByName}</small>
              </div>
            ) : null}
            <button
              className="secondary-action"
              disabled={routeApprovalState === "checking"}
              onClick={requestGroupRouteApproval}
              type="button"
            >
              <CheckCircle2 size={18} aria-hidden="true" />
              בנה מסלול קבוצתי קצר
            </button>
            <small className="action-approval-status">
              {routeApprovalState === "approved"
                ? "מסלול קבוצתי אושר ונשמר."
                : routeApprovalState === "blocked"
                  ? "נדרש מנהל/ת כדי ליצור מסלול קבוצתי."
                  : routeApprovalState === "error"
                    ? "לא הצלחתי ליצור מסלול כרגע."
                    : routeApprovalState === "checking"
                      ? "בודק הרשאה ובונה מסלול..."
                      : "מסלול קבוצתי דורש אישור מנהל/ת."}
            </small>
            {groupRoute ? (
              <div className="group-route-card" aria-label="מסלול קבוצתי פעיל">
                <span>מסלול קבוצתי פעיל</span>
                <strong>{groupRoute.title}</strong>
                <small className="route-sync-status">
                  {routeRealtimeState === "live"
                    ? "מסלול מסונכרן"
                    : routeRealtimeState === "error"
                      ? "סנכרון מסלול ממתין לחיבור"
                      : "מכין סנכרון מסלול"}
                </small>
                {groupRoute.status === "completed" ? <p className="route-completed-note">המסלול הושלם. אפשר ליצור מסלול חדש כשצריך.</p> : null}
                <p>הסדר מתחיל בנקודה שנבחרה וממשיך לנקודות הקרובות ברשימת הטיול. ETA מדויק יגיע דרך Google Routes.</p>
                <ol>
                  {groupRoute.stops.map((stop, index) => (
                    <li
                      className={`${index === activeRouteStopIndex ? "active-route-stop" : ""} ${
                        groupRoute.completedStopIds.includes(stop.placeId) ? "completed-route-stop" : ""
                      }`}
                      key={stop.placeId}
                    >
                      <button onClick={() => setActiveRouteStopIndex(index)} type="button">
                        {groupRoute.completedStopIds.includes(stop.placeId) ? "הושלם · " : index === activeRouteStopIndex ? "עכשיו · " : ""}
                        {stop.placeName}
                      </button>
                    </li>
                  ))}
                </ol>
                <button
                  className="secondary-action route-navigation-action"
                  disabled={navigationState === "opening" || groupRoute.status === "completed"}
                  onClick={openActiveRouteStopInWaze}
                  type="button"
                >
                  <Navigation size={18} aria-hidden="true" />
                  פתח תחנה פעילה ב-Waze
                </button>
                <button
                  className="secondary-action route-navigation-action"
                  disabled={routeApprovalState === "checking" || groupRoute.status === "completed"}
                  onClick={completeActiveRouteStop}
                  type="button"
                >
                  <CheckCircle2 size={18} aria-hidden="true" />
                  סמן תחנה כהושלמה
                </button>
                <small>נוצר על ידי {groupRoute.createdByName}</small>
              </div>
            ) : null}
            <div className="external-shortcuts" aria-label="קיצורי אפליקציות חיצוניות">
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
            <form className="shortcut-form" onSubmit={addUserShortcut}>
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
            {navigationState === "error" ? <small>לא הצלחתי ליצור קישור ניווט כרגע.</small> : null}
          </section>
        ) : null}

        <div className="kodi-presence" aria-label="נוכחות קודי">
          קודי ברקע · מתעורר כשקוראים לו
        </div>
      </section>

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
          <section className="invite-card" aria-label="הזמנת משתתפים לקבוצה">
            <div>
              <strong>הזמנת משתתפים</strong>
              <p>המנהל שולח קישור, וכל משתתף מצטרף מהנייד ומאשר הרשאות לעצמו.</p>
            </div>
            <div className="invite-actions">
              <input aria-label="קישור הזמנה לקבוצת הטיול" dir="ltr" readOnly value={tripInviteUrl} />
              <button onClick={copyTripInviteLink} type="button">
                העתק קישור
              </button>
            </div>
            <small>
              {inviteCopyState === "copied"
                ? "הקישור הועתק. אפשר לשלוח אותו בוואטסאפ."
                : inviteCopyState === "error"
                  ? "לא הצלחתי להעתיק אוטומטית. אפשר לסמן ולהעתיק את הקישור."
                  : "חוויית הצטרפות: שם, גיל, ואז אישור GPS אישי לפי בחירה."}
            </small>
          </section>
        </header>

        <section className="event-activity" aria-label="פעילות חיה בקבוצה">
          <div className="event-activity-heading">
            <strong>פעילות חיה</strong>
            <span>
              {eventRealtimeState === "live"
                ? eventLogDriver === "supabase"
                  ? "Supabase realtime-ready"
                  : "סנכרון מקומי"
                : eventRealtimeState === "error"
                  ? "ממתין לחיבור"
                  : "מכין סנכרון"}
            </span>
          </div>
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

        <section className="usage-overview" aria-label="בקרת שימושי קודי">
          <div className="usage-overview-heading">
            <span>
              <ShieldCheck size={14} aria-hidden="true" />
              בקרת שימושי קודי
            </span>
            <strong>{usageAuditOverview.totalAuthorizedCalls}</strong>
          </div>
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
          <p>
            {usageAuditOverview.totalAuthorizedCalls > 0
              ? `שימוש אחרון: ${getUsageSourceLabel(usageAuditOverview.lastSource)} / ${
                  usageAuditOverview.lastCapability ?? "לא ידוע"
                }`
              : "עדיין לא נרשמה קריאת Google או AI יקרה בטיול הזה."}
          </p>
        </section>

        <div className="messages">
          {messages.map((message, index) => (
            <article className={message.author === "קודי" ? "message kodi" : "message"} key={`${message.author}-${index}-${message.text}`}>
              <strong>{message.author}</strong>
              <p>{message.text}</p>
            </article>
          ))}
        </div>

        <form className="composer" onSubmit={sendMessageWithPersistence}>
          <input
            aria-label="כתיבת הודעה לקבוצה"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="כתבו בקבוצה... קראו לקודי כשהוא צריך להתערב"
            value={draft}
          />
          <button type="submit">שלח</button>
        </form>
      </aside>
    </main>
  );
}
