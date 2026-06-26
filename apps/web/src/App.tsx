import { CheckCircle2, ExternalLink, MapPin, Menu, Navigation, Radio, ShieldCheck, Sparkles, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { demoMembers, demoMessages, demoPlaces, demoTripSummary } from "./demoTrip.js";

type PlaceType = "lodging" | "attraction" | "water" | "food" | "transport" | "stop" | "unknown";

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
  aiPlanMode: "demo" | "limited" | "full";
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

interface SetupDraft {
  tripName: string;
  memberName: string;
  memberAge: string;
  googleLink: string;
  aiPlanConfirmed: boolean;
  locationConsentExplained: boolean;
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

export function App() {
  const [showActivation, setShowActivation] = useState(true);
  const [setupState, setSetupState] = useState<TripSetupStateResponse | null>(null);
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
  const [groupRoute, setGroupRoute] = useState<GroupRoute | null>(null);
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
        }
      } catch {
        if (!ignore) {
          setSetupState({
            tripGroupId: "group_family_greece_demo",
            currentStep: "welcome",
            setupCompleted: false,
            aiPlanMode: "demo",
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
                title: "דמו או הפעלה מלאה",
                status: "pending",
                description: "מצב דמו מוגבל; שימוש אמיתי דורש מודל AI או תקציב API מתאים."
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
    void loadTripState();
    void loadMessages();
    void loadTripEvents();

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

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

    void pollGroupMessages();
    const intervalId = window.setInterval(pollGroupMessages, 4000);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
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

    void pollMemberLocations();
    const intervalId = window.setInterval(pollMemberLocations, 5000);

    return () => {
      ignore = true;
      window.clearInterval(intervalId);
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
  const activeMember = members.find((member) => member.id === activeMemberId) ?? members[0] ?? {
    id: "mom",
    name: "אמא",
    role: "owner",
    ageGroup: "adult",
    locationSharing: "enabled",
    liveLocation: null
  };
  const visibleMembers = members.filter((member) => member.locationSharing === "enabled" && member.liveLocation);
  const recentTripEvents = tripEvents.slice(0, 3);
  const normalizedGoogleLink = setupDraft.googleLink.trim().toLowerCase();
  const setupReadiness = {
    hasOwner: setupDraft.tripName.trim().length > 1,
    hasMembers: setupDraft.memberName.trim().length > 1 && setupDraft.memberAge.trim().length > 0,
    hasGoogleSource: normalizedGoogleLink.includes("maps.app.goo.gl") || normalizedGoogleLink.includes("google.com/maps"),
    hasLocationConsentExplained: setupDraft.locationConsentExplained,
    hasAiPlanExplained: setupDraft.aiPlanConfirmed
  };
  const readinessItems = [
    { label: "שם טיול", ready: setupReadiness.hasOwner },
    { label: "חבר קבוצה ראשון", ready: setupReadiness.hasMembers },
    { label: "מקור Google", ready: setupReadiness.hasGoogleSource },
    { label: "הסבר הרשאות מיקום", ready: setupReadiness.hasLocationConsentExplained },
    { label: "הסבר דמו/תשלום", ready: setupReadiness.hasAiPlanExplained }
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
        text: `${activeMember.name} אישר/ה מסלול קבוצתי קצר סביב ${selectedPlace.name}. המסלול נשמר בדמו ומוצג עכשיו לכל הקבוצה.`,
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
      setSetupSaveError("לא הצלחתי לשמור את ההקמה מול השרת המקומי. אפשר לבדוק שה-API פעיל או לדלג לדמו.");
    }
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
              {setupState?.googleSource.importedPlacesCount ?? summary.total} נקודות טיול זמינות לדמו · קבוצה משפחתית ·
              מיקום בהרשאה בלבד
            </span>
          </div>
        </section>

        <aside className="activation-panel">
          <div className="kodi-welcome-card">
            <span className="eyebrow">קודי מתעורר לחיים</span>
            <h2>ברוכים הבאים</h2>
            <p>{setupState?.kodiWelcomeMessage ?? "אני קודי, מלווה הטיול של הקבוצה. אני עוזר לכם להפעיל את הטיול בצורה מסודרת."}</p>
          </div>

          <section className="activation-section" aria-label="איך מפעילים את קודי">
            <h3>איך מפעילים אותי?</h3>
            <div className="activation-callout">
              <strong>כותבים בקבוצה: “קודי…”</strong>
              <p>אני קורא את ההקשר האחרון, מזהה מי פונה אליי, ומתחשב בגיל, תפקיד והרשאות. פעולות שמשנות יעד או מסלול דורשות מנהל.</p>
            </div>
          </section>

          <section className="activation-section" aria-label="מצב דמו ותשלום">
            <h3>דמו מול הפעלה מלאה</h3>
            <div className="plan-note">
              <ShieldCheck size={18} aria-hidden="true" />
              <p>
                מצב דמו מתאים להיכרות. שימוש אמיתי בטיול משפחתי דורש מודל AI מתאים או תקציב API בתשלום, כי צריך
                שיחה ארוכה, מיקום חי, נקודות Google והמלצות בזמן אמת.
              </p>
            </div>
            <label className="activation-checkbox">
              <input
                checked={setupDraft.aiPlanConfirmed}
                onChange={(event) => setSetupDraft((draft) => ({ ...draft, aiPlanConfirmed: event.target.checked }))}
                type="checkbox"
              />
              הבנתי: הדמו מוגבל, והפעלה אמיתית תדרוש מודל AI או תקציב API מתאים.
            </label>
          </section>

          <section className="activation-section" aria-label="פרטי הקמה ראשוניים">
            <h3>הקמה מהירה</h3>
            <div className="setup-form">
              <label>
                שם הטיול
                <input
                  aria-label="שם הטיול"
                  onChange={(event) => setSetupDraft((draft) => ({ ...draft, tripName: event.target.value }))}
                  placeholder="למשל: יוון משפחתי 2026"
                  value={setupDraft.tripName}
                />
              </label>
              <div className="field-row">
                <label>
                  חבר קבוצה ראשון
                  <input
                    aria-label="שם חבר קבוצה"
                    onChange={(event) => setSetupDraft((draft) => ({ ...draft, memberName: event.target.value }))}
                    placeholder="שם"
                    value={setupDraft.memberName}
                  />
                </label>
                <label>
                  גיל
                  <input
                    aria-label="גיל חבר קבוצה"
                    inputMode="numeric"
                    onChange={(event) => setSetupDraft((draft) => ({ ...draft, memberAge: event.target.value }))}
                    placeholder="8"
                    value={setupDraft.memberAge}
                  />
                </label>
              </div>
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
              <label className="activation-checkbox">
                <input
                  checked={setupDraft.locationConsentExplained}
                  onChange={(event) =>
                    setSetupDraft((draft) => ({ ...draft, locationConsentExplained: event.target.checked }))
                  }
                  type="checkbox"
                />
                הבנתי: GPS ושיתוף מיקום קבוצתי יופעלו רק אחרי הסכמה מפורשת של כל משתתף.
              </label>
            </div>
          </section>

          <section className="activation-section" aria-label="שלבי קליטה">
            <h3>מסלול הקליטה</h3>
            <div className="setup-steps">
              {(setupState?.steps ?? []).map((step, index) => (
                <article className={step.status} key={step.id}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <p>{step.description}</p>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="activation-section" aria-label="בדיקת מוכנות">
            <h3>בדיקת מוכנות</h3>
            <div className="source-status">
              <strong>מקור Google</strong>
              <p>
                {setupDraft.googleLink.trim() ? "Google Maps Place List viewing link" : setupState?.googleSource.displayName ?? "Google Maps Place List viewing link"} ·{" "}
                {setupState?.googleSource.importedPlacesCount ?? summary.total} נקודות נטענו לדמו
              </p>
            </div>
            <div className="readiness-grid">
              {readinessItems.map((item) => (
                <span className={item.ready ? "ready" : "missing"} key={item.label}>
                  <CheckCircle2 size={15} aria-hidden="true" />
                  {item.label}
                </span>
              ))}
            </div>
          </section>

          <div className="activation-actions">
            <button disabled={!setupReady || setupSaveState === "saving"} type="button" onClick={saveSetupAndStart}>
              {setupSaveState === "saving" ? "שומר את ההקמה..." : "התחילו עם קודי"}
            </button>
            <button className="secondary" type="button" onClick={() => setShowActivation(false)}>
              דלג לדמו
            </button>
            {setupSaveError ? <small className="setup-error">{setupSaveError}</small> : null}
            <small>ב-MVP מחברים Google דרך קישור צפייה. OAuth וכתיבה חזרה לגוגל הם שלבים עתידיים.</small>
          </div>
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
            {loadState === "ready" ? "מחובר ל-API המקומי" : "נתוני fallback זמינים"}
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
          <div className="group-location-layer" aria-label="מיקומי חברי קבוצה בדמו">
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
            {locationState === "error" ? <small>לא הצלחתי לקבל מיקום. אפשר להמשיך בדמו בלי GPS.</small> : null}
            {locationSyncState === "synced" ? <small>סונכרן לדמו עבור {activeMember.name}</small> : null}
            {locationSyncState === "blocked" ? <small>לא סונכרן כי לחבר הזה אין הסכמת שיתוף.</small> : null}
            {locationSyncState === "error" ? <small>GPS פעיל, אבל סנכרון הדמו לשרת נכשל.</small> : null}
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
                {groupRoute.status === "completed" ? <p className="route-completed-note">המסלול הושלם. אפשר ליצור מסלול חדש כשצריך.</p> : null}
                <p>הסדר בדמו מתחיל בנקודה שנבחרה וממשיך לנקודות הקרובות ברשימת הטיול. ETA אמיתי יגיע רק עם Google Routes.</p>
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
