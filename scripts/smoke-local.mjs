import { join } from "node:path";
import { pathToFileURL } from "node:url";

async function loadChromium() {
  try {
    return (await import("playwright")).chromium;
  } catch {
    const fallbackModule = join(
      "C:\\Users\\yaako\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\.pnpm\\node_modules\\playwright-core",
      "index.js"
    );
    const fallback = await import(pathToFileURL(fallbackModule).href);
    return fallback.chromium ?? fallback.default.chromium;
  }
}

const chromium = await loadChromium();

const launchOptions = process.env.BROWSER_EXECUTABLE
  ? { executablePath: process.env.BROWSER_EXECUTABLE, headless: true }
  : { headless: true };

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({
  viewport: { width: 1280, height: 820 },
  geolocation: { latitude: 39.2514, longitude: 22.7515 },
  permissions: ["geolocation"]
});
const page = await context.newPage();

function assertCheck(name, condition) {
  if (!condition) {
    throw new Error(`Missing smoke check: ${name}`);
  }
}

try {
  const streamController = new AbortController();
  const streamResponse = await fetch("http://localhost:3001/api/trips/demo/events/stream", {
    signal: streamController.signal
  });
  const streamReader = streamResponse.body?.getReader();
  const streamChunk = streamReader ? await streamReader.read() : null;
  streamController.abort();
  const streamText = streamChunk?.value ? new TextDecoder().decode(streamChunk.value) : "";
  assertCheck("event stream endpoint", streamResponse.ok && streamText.includes("event: trip-events"));

  const messageStreamController = new AbortController();
  const messageStreamResponse = await fetch("http://localhost:3001/api/trips/demo/messages/stream", {
    signal: messageStreamController.signal
  });
  const messageStreamReader = messageStreamResponse.body?.getReader();
  const messageStreamChunk = messageStreamReader ? await messageStreamReader.read() : null;
  messageStreamController.abort();
  const messageStreamText = messageStreamChunk?.value ? new TextDecoder().decode(messageStreamChunk.value) : "";
  assertCheck(
    "message stream endpoint",
    messageStreamResponse.ok && messageStreamText.includes("event: trip-messages")
  );

  const memberStreamController = new AbortController();
  const memberStreamResponse = await fetch("http://localhost:3001/api/trips/demo/members/stream", {
    signal: memberStreamController.signal
  });
  const memberStreamReader = memberStreamResponse.body?.getReader();
  const memberStreamChunk = memberStreamReader ? await memberStreamReader.read() : null;
  memberStreamController.abort();
  const memberStreamText = memberStreamChunk?.value ? new TextDecoder().decode(memberStreamChunk.value) : "";
  assertCheck(
    "member stream endpoint",
    memberStreamResponse.ok && memberStreamText.includes("event: trip-members")
  );

  const routeStreamController = new AbortController();
  const routeStreamResponse = await fetch("http://localhost:3001/api/trips/demo/group-route/stream", {
    signal: routeStreamController.signal
  });
  const routeStreamReader = routeStreamResponse.body?.getReader();
  const routeStreamChunk = routeStreamReader ? await routeStreamReader.read() : null;
  routeStreamController.abort();
  const routeStreamText = routeStreamChunk?.value ? new TextDecoder().decode(routeStreamChunk.value) : "";
  assertCheck("group route stream endpoint", routeStreamResponse.ok && routeStreamText.includes("event: group-route"));

  const destinationStreamController = new AbortController();
  const destinationStreamResponse = await fetch("http://localhost:3001/api/trips/demo/group-destination/stream", {
    signal: destinationStreamController.signal
  });
  const destinationStreamReader = destinationStreamResponse.body?.getReader();
  const destinationStreamChunk = destinationStreamReader ? await destinationStreamReader.read() : null;
  destinationStreamController.abort();
  const destinationStreamText = destinationStreamChunk?.value
    ? new TextDecoder().decode(destinationStreamChunk.value)
    : "";
  assertCheck(
    "group destination stream endpoint",
    destinationStreamResponse.ok && destinationStreamText.includes("event: group-destination")
  );

  const googleSourceResponse = await fetch("http://localhost:3001/api/trips/demo/google-source");
  const googleSourcePayload = await googleSourceResponse.json();
  assertCheck("google source preview endpoint", googleSourceResponse.ok);
  assertCheck("google source adapter kind", googleSourcePayload.adapter?.kind === "fixture");
  assertCheck("google source no live access", googleSourcePayload.adapter?.liveGoogleAccess === false);
  assertCheck("google source preview mode", googleSourcePayload.source?.state === "read_only_preview");
  assertCheck("google source sync mode", googleSourcePayload.sync?.mode === "read_only_fixture");
  assertCheck("google source preview count", googleSourcePayload.source?.importedPlacesCount >= 100);
  assertCheck("google source write-back blocked", googleSourcePayload.sync?.canWriteBackToGoogle === false);

  const googleReadinessResponse = await fetch("http://localhost:3001/api/trips/demo/google-source/readiness");
  const googleReadinessPayload = await googleReadinessResponse.json();
  assertCheck("google source readiness endpoint", googleReadinessResponse.ok);
  assertCheck("google source active adapter fixture", googleReadinessPayload.activeAdapterKind === "fixture");
  assertCheck("google api skeleton not configured", googleReadinessPayload.futureGoogleApiAdapter?.state === "not_configured");
  assertCheck("google api skeleton no live access", googleReadinessPayload.futureGoogleApiAdapter?.liveGoogleAccess === false);
  assertCheck("google api readiness hides values", googleReadinessPayload.requirements?.every((item) => item.value === undefined));

  const usageResponse = await fetch("http://localhost:3001/api/trips/demo/usage");
  const usagePayload = await usageResponse.json();
  assertCheck("trip usage endpoint", usageResponse.ok);
  assertCheck("trip usage owner managed", usagePayload.usagePool?.billingModel === "owner_managed");
  assertCheck("trip usage participants not billed", usagePayload.usagePool?.participantBillingRequired === false);
  assertCheck("trip usage backend mediated", usagePayload.usagePool?.backendMediated === true);
  assertCheck("trip usage hides secrets", usagePayload.usagePool?.secretBoundary?.browserReceivesPrivateKeys === false);
  assertCheck(
    "trip usage capabilities charged to pool",
    usagePayload.usagePool?.capabilities?.every((item) => item.chargedTo === "trip_usage_pool")
  );

  const speechResponse = await fetch("http://localhost:3001/api/agent/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: "שלום, אני קודי. אני כאן כדי לעזור לכם בטיול.",
      memberId: "manager",
      memberName: "מנהל הטיול",
      memberRole: "owner"
    })
  });
  const speechContentType = speechResponse.headers.get("content-type") ?? "";
  assertCheck(
    "agent speech endpoint safe",
    (speechResponse.ok && speechContentType.includes("audio/")) ||
      ([502, 503].includes(speechResponse.status) && speechContentType.includes("application/json"))
  );

  const timelineResponse = await fetch("http://localhost:3001/api/trips/demo/timeline");
  const timelinePayload = await timelineResponse.json();
  assertCheck("trip timeline endpoint", timelineResponse.ok);
  assertCheck("trip timeline source", timelinePayload.source === "google_map_order_lodging_segments");
  assertCheck("trip timeline lodging segments", Array.isArray(timelinePayload.segments) && timelinePayload.segments.length >= 8);
  assertCheck(
    "trip timeline pelion segment",
    timelinePayload.segments.some((segment) => segment.regionHints?.includes("pelion") && segment.lodging?.lat)
  );

  const googlePlacesSearchResponse = await fetch(
    "http://localhost:3001/api/google/places/text-search?query=gelato%20near%20hotel&lat=39.2514&lng=22.7515&radiusMeters=3000"
  );
  const googlePlacesSearchPayload = await googlePlacesSearchResponse.json();
  assertCheck("google places text search endpoint", googlePlacesSearchResponse.ok);
  assertCheck("google places text search guarded", googlePlacesSearchPayload.status === "not_configured");
  assertCheck("google places text search no values", googlePlacesSearchPayload.apiKey === undefined);
  assertCheck("google places text search field mask", googlePlacesSearchPayload.request?.fieldMask?.includes("places.displayName"));
  assertCheck("google places usage gate", googlePlacesSearchPayload.usageGate?.reason === "usage_pool_authorized");
  assertCheck("google places usage charged to pool", googlePlacesSearchPayload.usageGate?.chargedTo === "trip_usage_pool");

  const directUsageEventsPayload = await (await fetch("http://localhost:3001/api/trips/demo/events")).json();
  assertCheck(
    "direct google usage audit event",
    directUsageEventsPayload.events?.some(
      (event) =>
        event.eventType === "system" &&
        event.relatedEntityId === "google_places" &&
        event.summary?.includes("Usage gate authorized google_places via direct_api")
    )
  );
  const usageAfterDirectGooglePayload = await (await fetch("http://localhost:3001/api/trips/demo/usage")).json();
  assertCheck("trip usage audit summary", usageAfterDirectGooglePayload.usageAudit?.totalAuthorizedCalls >= 1);
  assertCheck(
    "trip usage audit capability count",
    usageAfterDirectGooglePayload.usageAudit?.byCapability?.some(
      (item) => item.capability === "google_places" && item.count >= 1
    )
  );

  const googleRouteEstimateResponse = await fetch(
    "http://localhost:3001/api/google/routes/estimate?originLat=39.2514&originLng=22.7515&destinationLat=39.935888&destinationLng=20.670744&travelMode=DRIVE"
  );
  const googleRouteEstimatePayload = await googleRouteEstimateResponse.json();
  assertCheck("google routes estimate endpoint", googleRouteEstimateResponse.ok);
  assertCheck("google routes estimate guarded", googleRouteEstimatePayload.status === "not_configured");
  assertCheck("google routes estimate no values", googleRouteEstimatePayload.apiKey === undefined);
  assertCheck("google routes estimate field mask", googleRouteEstimatePayload.request?.fieldMask === "routes.duration,routes.distanceMeters");
  assertCheck("google routes usage gate", googleRouteEstimatePayload.usageGate?.reason === "usage_pool_authorized");
  assertCheck("google routes usage charged to pool", googleRouteEstimatePayload.usageGate?.chargedTo === "trip_usage_pool");

  await page.request.delete("http://localhost:3001/api/trips/demo/setup");
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => window.localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });

  const setupPayload = await (await page.request.get("http://localhost:3001/api/trips/demo/setup")).json();
  assertCheck("setup starts disconnected", setupPayload.googleSource?.importedPlacesCount === 0);

  await page.locator(".guided-step").getByText("שלום, אני קודי").waitFor();
  const activationBody = await page.locator("body").innerText();
  assertCheck("guided activation shell", activationBody.includes("שלום, אני קודי"));
  assertCheck("guided activation single purpose", activationBody.includes("הפעל את קודי"));
  assertCheck("guided activation clean copy", !activationBody.includes("בית חב\"ד קרוב") && !activationBody.includes("תחנת דלק"));
  assertCheck("guided activation no bypass", !activationBody.includes("כניסה לחשבון הטיול"));

  await page.getByRole("button", { name: "הפעל את קודי" }).click();
  await page.getByText("מאיפה לקרוא את הטיול?").waitFor();
  assertCheck("trip source continue initially disabled", await page.getByRole("button", { name: "המשך למיקום מנהל" }).isDisabled());
  await page.locator(".guided-step").getByLabel("שם הטיול").fill("יוון משפחתי 2026");
  await page.locator(".guided-step").getByLabel("קישור Google Maps").fill("https://maps.app.goo.gl/MspoN6j9CJDyGmtb8");
  await page.locator(".guided-step").getByLabel("שם מנהל הטיול").fill("אמא");
  await page.locator(".guided-step").getByLabel("גיל מנהל הטיול").fill("40");
  await page.getByText("הקישור זוהה").waitFor();
  await page.getByRole("button", { name: "המשך למיקום מנהל" }).click();
  await page.getByText("נפעיל מיקום מנהל").waitFor();
  await page.getByRole("button", { name: "הפעל מיקום מנהל במפה" }).click();
  await page.getByText("מיקום מנהל פעיל במפה").waitFor();
  assertCheck("manager location primary continue", await page.getByRole("button", { name: "המשך למפה ולשיחה" }).isVisible());
  assertCheck("manager location refresh is secondary", await page.getByRole("button", { name: "רענן מיקום" }).isVisible());
  await page.getByRole("button", { name: "המשך למפה ולשיחה" }).click();
  await page.getByText("הלב מוכן").waitFor();
  await page.getByRole("button", { name: "כניסה למפה ולשיחה" }).click();

  await page.locator(".map-surface").waitFor();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator(".map-surface").waitFor();
  const returningUserBody = await page.locator("body").innerText();
  assertCheck("returning user skips completed onboarding", !returningUserBody.includes("שלום, אני קודי"));

  const body = await page.locator("body").innerText();
  const tripStateResponse = await page.request.get("http://localhost:3001/api/trips/demo/state");
  const tripStatePayload = await tripStateResponse.json();
  const savedSetupResponse = await page.request.get("http://localhost:3001/api/trips/demo/setup");
  const savedSetupPayload = await savedSetupResponse.json();
  const membersResponse = await page.request.get("http://localhost:3001/api/trips/demo/members");
  const membersPayload = await membersResponse.json();
  const messagesResponse = await page.request.get("http://localhost:3001/api/trips/demo/messages");
  const messagesPayload = await messagesResponse.json();
  const storageResponse = await page.request.get("http://localhost:3001/api/trips/demo/storage");
  const storagePayload = await storageResponse.json();
  const eventsResponse = await page.request.get("http://localhost:3001/api/trips/demo/events");
  const eventsPayload = await eventsResponse.json();

  assertCheck("map", body.includes("מפה חיה"));
  const mapShellClass = await page.locator(".map-placeholder").evaluate((element) => element.className);
  const googleMapsActive = String(mapShellClass).includes("google-map-active");
  assertCheck("trip source loaded", storageResponse.ok() && Boolean(storagePayload.storage));
  assertCheck("places count", body.includes("108 נקודות"));
  assertCheck("group chat", body.includes("קבוצת הטיול"));
  assertCheck("kodi background", body.includes("קודי ברקע"));
  assertCheck("google maps is target provider", body.includes("Google Maps"));
  assertCheck("direct google maps handoff visible", await page.getByRole("button", { name: "פתח Google Maps" }).isVisible());
  if (googleMapsActive) {
    assertCheck("google maps active", googleMapsActive);
  } else {
    assertCheck("google maps fallback marked temporary", String(mapShellClass).includes("internal-map-fallback"));
  }
  assertCheck("trip map focus", body.includes("מפת הטיול") && body.includes("המיקום שלך מוצג מעליה"));
  assertCheck("place marker", (await page.locator(".place-marker").count()) > 0);
  assertCheck("retired demo family hidden", !body.includes("אבא") && !body.includes("נועה") && !body.includes("סבתא"));
  await page.getByRole("button", { name: "תפריט" }).click();
  const menu = page.locator(".secondary-menu");
  let menuBody = await menu.innerText();
  assertCheck("personal live location copy in menu", menuBody.includes("מיקום בטלפון"));
  assertCheck("direct location action in menu", menuBody.includes("אשר מיקום") || menuBody.includes("רענן מיקום"));
  assertCheck("invite moved to menu", menuBody.includes("הזמנת משתתפים"));
  assertCheck("invite per-device consent in menu", menuBody.includes("מאשר מיקום ומצטרף"));
  assertCheck("invite native share action in menu", menuBody.includes("שתף הזמנה"));

  await menu.getByText("אפשרויות נוספות").click();
  menuBody = await menu.innerText();
  assertCheck("event activity in menu", menuBody.includes("פעילות חיה"));
  assertCheck("waze in menu", menuBody.includes("פתח ב-Waze"));
  assertCheck("google maps shortcut in menu", menuBody.includes("Google Maps"));
  assertCheck("booking shortcut in menu", menuBody.includes("Booking"));
  assertCheck("airbnb shortcut in menu", menuBody.includes("Airbnb"));
  assertCheck("full trip places list in menu", menuBody.includes("כל נקודות הטיול") && menuBody.includes("108 נקודות זמינות"));
  assertCheck("trip places list has many entries", (await menu.locator(".trip-place-list button").count()) >= 20);
  assertCheck("map surface stays clean", await page.locator(".map-surface > .action-card").isHidden());
  assertCheck("chat invite card hidden", await page.locator(".chat-sheet .invite-card").count() === 0);

  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.goto("http://127.0.0.1:5173/", { waitUntil: "domcontentloaded" });
  await mobilePage.locator(".map-surface").waitFor();
  assertCheck("mobile map visible", await mobilePage.locator(".map-surface").isVisible());
  assertCheck("mobile chat visible", await mobilePage.locator(".chat-sheet").isVisible());
  assertCheck("mobile google maps handoff visible", await mobilePage.getByRole("button", { name: "פתח Google Maps" }).isVisible());
  const mobileCoreHeights = await mobilePage.evaluate(() => {
    const map = document.querySelector(".map-surface")?.getBoundingClientRect();
    const chat = document.querySelector(".chat-sheet")?.getBoundingClientRect();
    return { mapHeight: map?.height ?? 0, chatHeight: chat?.height ?? 0 };
  });
  assertCheck("mobile chat prioritized over map", mobileCoreHeights.chatHeight > mobileCoreHeights.mapHeight);
  assertCheck(
    "mobile menu closed by default",
    !(await mobilePage.locator(".app-shell").evaluate((element) => element.classList.contains("secondary-menu-visible")))
  );
  assertCheck("mobile activity hidden by default", !(await mobilePage.locator(".event-activity").isVisible()));
  await mobilePage.locator(".top-bar .icon-button").click();
  assertCheck(
    "mobile hamburger opens management",
    await mobilePage.locator(".app-shell").evaluate((element) => element.classList.contains("secondary-menu-visible"))
  );
  await mobilePage.close();

  const inviteUrl = await page.getByLabel("קישור הזמנה בתפריט ניהול").inputValue();
  assertCheck("invite link token", inviteUrl.includes("?join=group_family_greece_demo"));

  const joinPage = await context.newPage();
  await joinPage.goto(inviteUrl, { waitUntil: "domcontentloaded" });
  await joinPage.getByText("מצטרפים לקודי").waitFor();
  await joinPage.getByLabel("שם משתתף להצטרפות").fill("דניאל");
  await joinPage.getByLabel("גיל משתתף להצטרפות").fill("11");
  await joinPage.getByRole("button", { name: "הצטרפות לקבוצה" }).click();
  await joinPage.getByRole("heading", { name: "קבוצת הטיול" }).waitFor();
  const joinBody = await joinPage.locator("body").innerText();
  assertCheck("join adds participant locally", joinBody.includes("דניאל"));
  assertCheck("join location consent copy", joinBody.includes("מיקום אישי במפה יוצג רק אחרי אישור מיקום"));
  await joinPage.close();

  assertCheck("members api ok", membersResponse.ok());
  assertCheck("members api still available", membersPayload.members?.length >= 1);
  assertCheck("messages api ok", messagesResponse.ok());
  assertCheck("messages api returns an array", Array.isArray(messagesPayload.messages));
  assertCheck(
    "retired seed messages hidden",
    !messagesPayload.messages?.some((message) =>
      ["msg_demo_dad_ice_cream", "msg_demo_noa_sleep", "msg_demo_mom_kodi", "msg_demo_kodi_reply"].includes(message.id)
    )
  );
  assertCheck("storage status ok", storageResponse.ok() && storagePayload.storage?.driver === "file");
  assertCheck("storage realtime not ready", storagePayload.storage?.realtimeReady === false);
  assertCheck("events api ok", eventsResponse.ok() && Array.isArray(eventsPayload.events));
  assertCheck("events file fallback", eventsPayload.eventLog?.driver === "file");
  assertCheck("events visible in advanced menu", menuBody.includes("פעילות חיה"));
  const usageOverviewText = await page.locator(".secondary-menu .usage-overview-grid").innerText();
  assertCheck("usage overview visible", usageOverviewText.includes("Google Places") && usageOverviewText.includes("Google Routes"));

  const savedMessageResponse = await page.request.post("http://localhost:3001/api/trips/demo/messages", {
    data: { author: "QA", text: "בדיקת שמירת שיחה", source: "system" }
  });
  const savedMessagePayload = await savedMessageResponse.json();
  assertCheck("messages api append", savedMessageResponse.ok() && savedMessagePayload.message?.text === "בדיקת שמירת שיחה");
  const eventsAfterMessageResponse = await page.request.get("http://localhost:3001/api/trips/demo/events");
  const eventsAfterMessagePayload = await eventsAfterMessageResponse.json();
  assertCheck(
    "events message recorded",
    eventsAfterMessagePayload.events?.some(
      (event) => event.eventType === "message_created" && event.relatedEntityId === savedMessagePayload.message?.id
    )
  );
  assertCheck(
    "members api consent",
    membersPayload.members?.some((item) => item.member?.role === "viewer" && item.consent?.state === "disabled")
  );

  const blockedLocationResponse = await page.request.post("http://localhost:3001/api/trips/demo/members/grandma/location", {
    data: { lat: 39.25, lng: 22.75 }
  });
  assertCheck("location consent block", blockedLocationResponse.status() === 403);

  assertCheck("trip state api ok", tripStateResponse.ok());
  assertCheck("trip state places", tripStatePayload.places?.length >= 100);
  assertCheck("trip state members", tripStatePayload.members?.length === 4);
  assertCheck("trip state agent", tripStatePayload.agentContext?.name === "קודי");
  assertCheck("saved setup ok", savedSetupResponse.ok());
  assertCheck("saved setup completed", savedSetupPayload.setupCompleted === true);
  assertCheck("saved setup trip", savedSetupPayload.setupSummary?.tripName === "יוון משפחתי 2026");
  assertCheck("saved setup member", savedSetupPayload.setupSummary?.firstMemberName?.length > 1);
  assertCheck("saved setup places", savedSetupPayload.googleSource?.importedPlacesCount === 108);

  const locationAgentResponse = await page.request.post("http://localhost:3001/api/agent/message", {
    data: {
      member: { id: "mom", displayName: "אמא", role: "owner", ageGroup: "adult" },
      message: "קודי, איפה כולם עכשיו?",
      recentMessages: []
    }
  });
  const locationAgentPayload = await locationAgentResponse.json();
  assertCheck("agent location ok", locationAgentResponse.ok());
  assertCheck("agent location intent", locationAgentPayload.intent === "group_location");
  assertCheck("agent openai fallback runtime", locationAgentPayload.agentRuntime?.fallbackUsed === true);
  assertCheck("agent openai status safe", locationAgentPayload.agentRuntime?.openAiStatus === "not_configured");
  assertCheck("agent location context", locationAgentPayload.contextSummary?.memberId === "mom");
  assertCheck(
    "agent openai usage gate present",
    locationAgentPayload.contextSummary?.usageGateResults?.some(
      (item) => item.capability === "openai_agent" && item.providerConfigured === false
    )
  );
  assertCheck("agent location state", locationAgentPayload.text?.includes("מיקום") || locationAgentPayload.text?.includes("קבוצה"));
  assertCheck("agent hides no consent", locationAgentPayload.text?.includes("לא חושף אותם בלי הסכמה"));

  const recommendationAgentResponse = await page.request.post("http://localhost:3001/api/agent/message", {
    data: {
      member: { id: "mom", displayName: "אמא", role: "owner", ageGroup: "adult" },
      message: "קודי, מה כדאי לעשות עכשיו? תמליץ על משהו עם מים.",
      recentMessages: []
    }
  });
  const recommendationAgentPayload = await recommendationAgentResponse.json();
  assertCheck("agent recommendation ok", recommendationAgentResponse.ok());
  assertCheck("agent recommendation intent", recommendationAgentPayload.intent === "place_recommendation");
  assertCheck("agent recommendation state", recommendationAgentPayload.contextSummary?.hasTripState === true);
  assertCheck("agent recommendation admin policy", recommendationAgentPayload.contextSummary?.operationalChangesRequireAdmin === true);
  assertCheck("agent recommendation text", recommendationAgentPayload.text?.includes("ההמלצה שלי כרגע היא"));
  assertCheck("agent no invented eta", recommendationAgentPayload.text?.includes("אני לא קובע עדיין זמן נסיעה"));
  assertCheck("agent reasons", recommendationAgentPayload.text?.includes("הנימוקים המרכזיים"));
  assertCheck("agent alternatives", recommendationAgentPayload.text?.includes("חלופות שדחיתי"));

  const gelatoAgentResponse = await page.request.post("http://localhost:3001/api/agent/message", {
    data: {
      member: { id: "mom", displayName: "אמא", role: "owner", ageGroup: "adult" },
      message: "קודי, בא לילדים גלידה קרוב למלון. מה יש באזור?",
      recentMessages: []
    }
  });
  const gelatoAgentPayload = await gelatoAgentResponse.json();
  assertCheck("agent google places context ok", gelatoAgentResponse.ok());
  assertCheck("agent google places status", gelatoAgentPayload.contextSummary?.externalPlacesSearchStatus === "not_configured");
  assertCheck("agent google places guarded copy", gelatoAgentPayload.text?.includes("חיפוש Google Places חי עדיין לא מופעל"));
  assertCheck(
    "agent google places usage gate",
    gelatoAgentPayload.contextSummary?.usageGateResults?.some(
      (item) => item.capability === "google_places" && item.reason === "usage_pool_authorized"
    )
  );
  const agentUsageEventsPayload = await (await page.request.get("http://localhost:3001/api/trips/demo/events")).json();
  assertCheck(
    "agent google usage audit event",
    agentUsageEventsPayload.events?.some(
      (event) =>
        event.eventType === "system" &&
        event.relatedEntityId === "google_places" &&
        event.summary?.includes("Usage gate authorized google_places via kodi_agent")
    )
  );

  const fastTripAgentResponse = await page.request.post("http://localhost:3001/api/agent/message", {
    data: {
      member: { id: "mom", displayName: "מנהל הטיול", role: "owner", ageGroup: "adult" },
      message: "קודי, איפה ישנים הלילה ואיזה טברנה קרובה יש לבית מלון?",
      recentMessages: []
    }
  });
  const fastTripAgentPayload = await fastTripAgentResponse.json();
  assertCheck("agent fast trip answer ok", fastTripAgentResponse.ok());
  assertCheck("agent fast trip answer lane", fastTripAgentPayload.agentRuntime?.fastLane !== true);
  assertCheck("agent fast trip answer skips openai", fastTripAgentPayload.agentRuntime?.openAiStatus !== "skipped_fast_lane");
  assertCheck("agent fast trip answer timed", typeof fastTripAgentPayload.agentRuntime?.latencyMs === "number");
  assertCheck("agent fast trip answer text", typeof fastTripAgentPayload.text === "string" && fastTripAgentPayload.text.length > 20);

  const futurePelionAgentResponse = await page.request.post("http://localhost:3001/api/agent/message", {
    data: {
      member: { id: "dad", displayName: "Dad", role: "owner", ageGroup: "adult" },
      message: "Kodi, in two days in Pelion find a beautiful beach near the hotel we will stay in.",
      recentMessages: []
    }
  });
  const futurePelionAgentPayload = await futurePelionAgentResponse.json();
  assertCheck("agent timeline context ok", futurePelionAgentResponse.ok());
  assertCheck("agent timeline context used", futurePelionAgentPayload.contextSummary?.timelineReferenceConfidence !== "low");
  assertCheck("agent timeline segment title", Boolean(futurePelionAgentPayload.contextSummary?.timelineSegmentTitle));

  const tripOverviewAgentResponse = await page.request.post("http://localhost:3001/api/agent/message", {
    data: {
      member: { id: "mom", displayName: "מנהל הטיול", role: "owner", ageGroup: "adult" },
      message: "קודי, מה אופי הטיול שלנו ביוון?",
      recentMessages: []
    }
  });
  const tripOverviewAgentPayload = await tripOverviewAgentResponse.json();
  assertCheck("agent trip overview ok", tripOverviewAgentResponse.ok());
  assertCheck("agent trip overview intent", tripOverviewAgentPayload.intent === "general");
  assertCheck("agent trip overview route arc", tripOverviewAgentPayload.text?.includes("צפון יוון") && tripOverviewAgentPayload.text?.includes("פיליון"));
  assertCheck("agent trip overview not local compromise", !tripOverviewAgentPayload.text?.includes("אפשר לחפש נקודה קלה ליד"));

  const blockedActionResponse = await page.request.post("http://localhost:3001/api/trips/demo/agent-actions/authorize", {
    data: {
      member: { id: "noa", displayName: "נועה", role: "member" },
      actionType: "set_group_destination"
    }
  });
  const blockedActionPayload = await blockedActionResponse.json();
  assertCheck("agent action member blocked", blockedActionResponse.status() === 403);
  assertCheck("agent action block reason", blockedActionPayload.reason === "operational_action_requires_admin");

  const allowedActionResponse = await page.request.post("http://localhost:3001/api/trips/demo/agent-actions/authorize", {
    data: {
      member: { id: "mom", displayName: "אמא", role: "owner" },
      actionType: "set_group_destination"
    }
  });
  const allowedActionPayload = await allowedActionResponse.json();
  assertCheck("agent action owner allowed", allowedActionResponse.ok() && allowedActionPayload.allowed === true);

  const blockedDestinationResponse = await page.request.post("http://localhost:3001/api/trips/demo/group-destination", {
    data: {
      member: { id: "noa", displayName: "נועה", role: "member" },
      placeId: tripStatePayload.places[0].id
    }
  });
  assertCheck("group destination member blocked", blockedDestinationResponse.status() === 403);

  const allowedDestinationResponse = await page.request.post("http://localhost:3001/api/trips/demo/group-destination", {
    data: {
      member: { id: "mom", displayName: "אמא", role: "owner" },
      placeId: tripStatePayload.places[0].id
    }
  });
  const allowedDestinationPayload = await allowedDestinationResponse.json();
  assertCheck(
    "group destination owner allowed",
    allowedDestinationResponse.ok() && allowedDestinationPayload.destination?.placeId === tripStatePayload.places[0].id
  );

  const blockedRouteResponse = await page.request.post("http://localhost:3001/api/trips/demo/group-route", {
    data: {
      member: { id: "noa", displayName: "נועה", role: "member" },
      placeIds: tripStatePayload.places.slice(0, 3).map((place) => place.id)
    }
  });
  assertCheck("group route member blocked", blockedRouteResponse.status() === 403);

  const allowedRouteResponse = await page.request.post("http://localhost:3001/api/trips/demo/group-route", {
    data: {
      member: { id: "mom", displayName: "אמא", role: "owner" },
      placeIds: tripStatePayload.places.slice(0, 3).map((place) => place.id),
      title: "מסלול QA קצר"
    }
  });
  const allowedRoutePayload = await allowedRouteResponse.json();
  assertCheck("group route owner allowed", allowedRouteResponse.ok() && allowedRoutePayload.route?.stops?.length >= 2);

  const contextAwareAgentResponse = await page.request.post("http://localhost:3001/api/agent/message", {
    data: {
      member: { id: "mom", displayName: "מנהל הטיול", role: "owner", ageGroup: "adult" },
      message: "קודי, איך מחברים את כולם בלי לשנות יעד בלי אישור?",
      recentMessages: [
        { author: "משתתף 1", text: "בא לי גלידה", source: "member" },
        { author: "משתתף צעיר", text: "אני עייף ורוצה לנוח", source: "member" },
        { author: "מנהל הטיול", text: "צריך משהו קרוב ורגוע", source: "member" }
      ]
    }
  });
  const contextAwareAgentPayload = await contextAwareAgentResponse.json();
  assertCheck("agent context-aware ok", contextAwareAgentResponse.ok());
  assertCheck("agent context-aware natural", !contextAwareAgentPayload.text?.includes("שמעתי את") && !contextAwareAgentPayload.text?.includes("מהשיחה אני מזהה"));
  assertCheck("agent context-aware needs", contextAwareAgentPayload.text?.includes("גלידה") || contextAwareAgentPayload.text?.includes("מנוחה") || contextAwareAgentPayload.text?.includes("קרוב"));
  assertCheck(
    "agent context-aware no boilerplate",
    !contextAwareAgentPayload.text?.includes("אבקש אישור מנהל") && !contextAwareAgentPayload.text?.includes("אם מנהל מאשר")
  );

  const input = page.getByLabel("כתיבת הודעה לקבוצה");
  const placeholder = await input.getAttribute("placeholder");
  assertCheck("family composer is quiet", placeholder === "");
  assertCheck("active speaker default", body.includes("כותבים עכשיו בשם מנהל הטיול"));
  await page.getByText("שיחה מסונכרנת").waitFor();
  await page.request.post("http://localhost:3001/api/trips/demo/messages", {
    data: { author: "QA", text: "הודעה שנכנסה מבחוץ", source: "system" }
  });
  await page.waitForTimeout(1200);
  assertCheck("qa system messages stay hidden", (await page.getByText("הודעה שנכנסה מבחוץ").count()) === 0);

  const wazeButton = menu.getByRole("button", { name: "פתח ב-Waze" });
  await input.fill("https://waze.com/ul?ll=31.25297,34.79146&navigate=yes");
  await page.locator(".composer button[type='submit']").click();
  const chatWazeLink = page.getByRole("link", { name: "פתח ב-Waze" }).last();
  await chatWazeLink.waitFor();
  const chatWazeHref = await chatWazeLink.getAttribute("href");
  assertCheck("chat waze URL becomes tappable", chatWazeHref?.includes("waze.com/ul?ll=31.25297,34.79146"));

  const disabled = await wazeButton.isDisabled();
  await menu.getByRole("button", { name: "בקש להפוך ליעד קבוצתי" }).click();
  await menu.getByText("אושר על ידי מנהל/ת").waitFor();
  await menu.getByText("יעד קבוצתי נוכחי").waitFor();
  await menu.getByRole("button", { name: "בנה מסלול קבוצתי קצר" }).click();
  await menu.getByText("מסלול קבוצתי אושר ונשמר.").waitFor();
  await menu.getByText("מסלול קבוצתי פעיל").waitFor();
  await menu.getByText("ETA מדויק").waitFor();
  await menu.getByText("עכשיו ·").waitFor();
  assertCheck("active route stop navigation", await menu.getByRole("button", { name: "פתח תחנה פעילה ב-Waze" }).isVisible());
  await menu.getByRole("button", { name: "סמן תחנה כהושלמה" }).click();
  await menu.getByText("הושלם ·").waitFor();
  await page.getByText("סימן/ה את").waitFor();
  for (let index = 0; index < 3; index += 1) {
    await menu.getByRole("button", { name: "סמן תחנה כהושלמה" }).click();
  }
  await menu.getByText("המסלול הושלם.").waitFor();
  assertCheck("route completion disables progress", await menu.getByRole("button", { name: "סמן תחנה כהושלמה" }).isDisabled());

  await menu.getByRole("button", { name: /אשר מיקום|רענן מיקום/ }).click();
  await menu.getByText("פעיל על Google Maps").waitFor();
  await page.locator(".self-marker").waitFor();
  const syncedMembersAfterLocation = await (await page.request.get("http://localhost:3001/api/trips/demo/members")).json();
  assertCheck(
    "live location synced after menu action",
    syncedMembersAfterLocation.members?.some((item) => item.liveLocation?.lat && item.liveLocation?.lng)
  );
  await page.getByText("אני כאן").waitFor();

  await menu.getByLabel("שם קיצור אישי").fill("תרגום");
  await menu.getByLabel("כתובת קיצור אישי").fill("https://translate.google.com/");
  await page.locator(".menu-shortcut-form button").click();
  await page.getByRole("link", { name: "תרגום" }).waitFor();

  const messagesBeforeFamilyOnly = await page.locator(".message").count();
  await input.fill("בא לי גלידה ליד המלון");
  await page.locator(".composer button[type='submit']").click();
  await page.getByText("בא לי גלידה ליד המלון").waitFor();
  assertCheck(
    "message activity visible",
    (await page.locator(".event-activity").getByText("שלח/ה הודעה בקבוצה").count()) >= 1
  );
  const messagesAfterFamilyOnly = await page.locator(".message").count();
  assertCheck("kodi stays asleep without call", messagesAfterFamilyOnly === messagesBeforeFamilyOnly + 1);

  await input.fill("קודי, מה מתאים לקבוצה עכשיו ליד המלון?");
  await page.locator(".composer button[type='submit']").click();
  await page.locator(".message.kodi").last().waitFor();
  assertCheck("kodi replies in chat", (await page.locator(".message.kodi").count()) >= 1);
  const lastKodiText = await page.locator(".message.kodi").last().innerText();
  assertCheck("kodi chat reply avoids template language", !lastKodiText.includes("שמעתי את") && !lastKodiText.includes("מהשיחה אני מזהה"));
  assertCheck("kodi voice output control", (await page.locator(".message.kodi .speak-message-button").count()) >= 1);

  assertCheck("retired demo member pill removed", (await page.locator(".member-pills").getByRole("button", { name: "נועה" }).count()) === 0);

  await input.fill("קודי, צור לנו מסלול חדש. יש לנו שעה פנויה ורוצים מזרקות קרובות.");
  await page.locator(".composer button[type='submit']").click();
  await page.getByText("אני יכול לבנות מסלול חדש").waitFor();

  await input.fill("קודי, ספר לנו קצת על המזרקה שאנחנו רואים.");
  await page.locator(".composer button[type='submit']").click();
  await page.getByText("אני יכול להיות רגע מדריך מקומי").waitFor();

  const kodiMessagesBeforeLocationQuestion = await page.locator(".message.kodi").count();
  await input.fill("קודי, איפה כולם עכשיו?");
  await page.locator(".composer button[type='submit']").click();
  await page.waitForFunction(
    (count) => document.querySelectorAll(".message.kodi").length > count,
    kodiMessagesBeforeLocationQuestion
  );

  await input.fill("קודי, מה כדאי לעשות עכשיו? תמליץ על משהו עם מים.");
  await page.locator(".composer button[type='submit']").click();
  await page.getByText("ההמלצה שלי כרגע היא").waitFor();

  console.log(
    JSON.stringify({
      ok: true,
      wazeButtonEnabled: !disabled,
      title: await page.title()
    })
  );
} finally {
  await browser.close();
}
