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
  await page.request.delete("http://localhost:3001/api/trips/demo/setup");
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });

  const setupPayload = await (await page.request.get("http://localhost:3001/api/trips/demo/setup")).json();
  assertCheck("setup starts disconnected", setupPayload.googleSource?.importedPlacesCount === 0);

  const activationBody = await page.locator("body").innerText();
  assertCheck("activation shell", activationBody.includes("Welcome + Activation"));
  assertCheck("kodi activation", activationBody.includes("קודי מתעורר לחיים"));
  assertCheck("api budget explanation", activationBody.includes("תקציב API"));
  assertCheck("google source explanation", activationBody.includes("Google Maps Place List"));
  assertCheck("location consent explanation", activationBody.includes("הסכמה מפורשת"));

  const startButton = page.getByRole("button", { name: "התחילו עם קודי" });
  assertCheck("start disabled before setup", await startButton.isDisabled());

  await page.getByLabel("שם הטיול").fill("יוון משפחתי 2026");
  await page.getByLabel("שם חבר קבוצה").fill("נועה");
  await page.getByLabel("גיל חבר קבוצה").fill("8");
  await page.getByLabel("קישור Google Maps").fill("https://maps.app.goo.gl/MspoN6j9CJDyGmtb8");
  await page.locator('.activation-checkbox input[type="checkbox"]').nth(0).check();
  await page.locator('.activation-checkbox input[type="checkbox"]').nth(1).check();
  await startButton.click();

  await page.getByText("מפה חיה").waitFor();

  await page.getByText("סנכרון חי פעיל").waitFor();
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
  assertCheck("api connected", body.includes("מחובר ל-API המקומי"));
  assertCheck("places count", body.includes("108 נקודות"));
  assertCheck("group chat", body.includes("קבוצת הטיול"));
  assertCheck("kodi background", body.includes("קודי ברקע"));
  assertCheck("event activity", body.includes("פעילות חיה"));
  assertCheck("waze", body.includes("פתח ב-Waze"));
  assertCheck("google maps shortcut", body.includes("Google Maps"));
  assertCheck("booking shortcut", body.includes("Booking"));
  assertCheck("airbnb shortcut", body.includes("Airbnb"));
  assertCheck("group location consent copy", body.includes("מיקום חברי קבוצה מוצג רק למי שאישר שיתוף"));
  assertCheck("internal map provider", body.includes("שכבת מפה פנימית"));
  assertCheck("map provider fallback reason", body.includes("חסר Google Maps API key"));
  assertCheck("place marker", body.includes("Hotel Marathia"));
  assertCheck("personal gps", body.includes("GPS אישי"));
  assertCheck("dad member", body.includes("אבא"));
  assertCheck("noa member", body.includes("נועה"));
  assertCheck("grandma member", body.includes("סבתא"));

  assertCheck("members api ok", membersResponse.ok());
  assertCheck("members api count", membersPayload.members?.length === 4);
  assertCheck("messages api ok", messagesResponse.ok());
  assertCheck("messages api initial", messagesPayload.messages?.length >= 4);
  assertCheck("storage status ok", storageResponse.ok() && storagePayload.storage?.driver === "file");
  assertCheck("storage realtime not ready", storagePayload.storage?.realtimeReady === false);
  assertCheck("events api ok", eventsResponse.ok() && Array.isArray(eventsPayload.events));
  assertCheck("events file fallback", eventsPayload.eventLog?.driver === "file");
  assertCheck(
    "events visible in ui",
    body.includes("קודי מחכה לפעילות ראשונה בקבוצה") ||
      body.includes("קודי הכין את יומן הפעילות") ||
      body.includes("הודעה")
  );
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
    membersPayload.members?.some((item) => item.member?.displayName === "סבתא" && item.consent?.state === "disabled")
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
  assertCheck("saved setup member", savedSetupPayload.setupSummary?.firstMemberName === "נועה");
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
  assertCheck("agent location context", locationAgentPayload.contextSummary?.memberId === "mom");
  assertCheck("agent location state", locationAgentPayload.text?.includes("אבא") && locationAgentPayload.text?.includes("נועה"));
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
      member: { id: "mom", displayName: "אמא", role: "owner", ageGroup: "adult" },
      message: "קודי, איך מחברים את כולם בלי לשנות יעד בלי אישור?",
      recentMessages: [
        { author: "אבא", text: "בא לי גלידה", source: "member" },
        { author: "נועה", text: "אני עייפה ורוצה לישון", source: "member" },
        { author: "אמא", text: "צריך משהו קרוב ורגוע", source: "member" }
      ]
    }
  });
  const contextAwareAgentPayload = await contextAwareAgentResponse.json();
  assertCheck("agent context-aware ok", contextAwareAgentResponse.ok());
  assertCheck("agent context-aware speakers", contextAwareAgentPayload.text?.includes("אבא") && contextAwareAgentPayload.text?.includes("נועה"));
  assertCheck("agent context-aware needs", contextAwareAgentPayload.text?.includes("גלידה") && contextAwareAgentPayload.text?.includes("מנוחה"));
  assertCheck("agent context-aware destination", contextAwareAgentPayload.text?.includes("היעד הקבוצתי הנוכחי"));

  const input = page.getByLabel("כתיבת הודעה לקבוצה");
  const placeholder = await input.getAttribute("placeholder");
  assertCheck("family composer", Boolean(placeholder?.includes("כתבו בקבוצה")));
  assertCheck("active speaker default", body.includes("כותבים עכשיו בשם אמא"));
  await page.getByText("שיחה מסונכרנת").waitFor();
  await page.request.post("http://localhost:3001/api/trips/demo/messages", {
    data: { author: "QA", text: "הודעה שנכנסה מבחוץ", source: "system" }
  });
  await page.getByText("הודעה שנכנסה מבחוץ").waitFor();

  const wazeButton = page.getByRole("button", { name: "פתח ב-Waze" });
  const disabled = await wazeButton.isDisabled();
  await page.getByRole("button", { name: "בקש להפוך ליעד קבוצתי" }).click();
  await page.getByText("אושר על ידי מנהל/ת").waitFor();
  await page.getByText("יעד קבוצתי נוכחי").waitFor();
  await page.getByRole("button", { name: "בנה מסלול קבוצתי קצר" }).click();
  await page.getByText("מסלול קבוצתי אושר ונשמר.").waitFor();
  await page.getByText("מסלול קבוצתי פעיל").waitFor();
  await page.getByText("ETA אמיתי").waitFor();
  await page.getByText("עכשיו ·").waitFor();
  assertCheck("active route stop navigation", await page.getByRole("button", { name: "פתח תחנה פעילה ב-Waze" }).isVisible());
  await page.getByRole("button", { name: "סמן תחנה כהושלמה" }).click();
  await page.getByText("הושלם ·").waitFor();
  await page.getByText("סימן/ה את").waitFor();
  for (let index = 0; index < 3; index += 1) {
    await page.getByRole("button", { name: "סמן תחנה כהושלמה" }).click();
  }
  await page.getByText("המסלול הושלם.").waitFor();
  assertCheck("route completion disables progress", await page.getByRole("button", { name: "סמן תחנה כהושלמה" }).isDisabled());

  await page.getByRole("button", { name: "הפעל GPS" }).click();
  await page.getByText("פעיל · דיוק").waitFor();
  await page.getByText("סונכרן לדמו עבור אמא").waitFor();
  await page.getByText("אני כאן").waitFor();

  await page.getByLabel("שם קיצור אישי").fill("תרגום");
  await page.getByLabel("כתובת קיצור אישי").fill("https://translate.google.com/");
  await page.locator(".shortcut-form button").click();
  await page.getByRole("link", { name: "תרגום" }).waitFor();

  const messagesBeforeFamilyOnly = await page.locator(".message").count();
  await input.fill("בא לי גלידה ליד המלון");
  await page.locator(".composer button").click();
  await page.getByText("בא לי גלידה ליד המלון").waitFor();
  await page.locator(".event-activity").getByText("אמא שלח/ה הודעה בקבוצה").waitFor();
  const messagesAfterFamilyOnly = await page.locator(".message").count();
  assertCheck("kodi stays asleep without call", messagesAfterFamilyOnly === messagesBeforeFamilyOnly + 1);

  await input.fill("קודי, מה מתאים לאבא שרוצה גלידה ולנועה שרוצה לישון?");
  await page.locator(".composer button").click();
  await page.getByText("מהשיחה אני מזהה").waitFor();

  await page.locator(".member-pills").getByRole("button", { name: "נועה" }).click();
  await page.getByText("כותבים עכשיו בשם נועה").waitFor();
  await page.getByRole("button", { name: "בקש להפוך ליעד קבוצתי" }).click();
  await page.getByText("נדרש מנהל/ת").waitFor();
  await input.fill("קודי, אני עייפה אבל אולי משהו קצר ליד המלון.");
  await page.locator(".composer button").click();
  await page.getByText("נועה").last().waitFor();

  await input.fill("קודי, צור לנו מסלול חדש. יש לנו שעה פנויה ורוצים מזרקות קרובות.");
  await page.locator(".composer button").click();
  await page.getByText("אני יכול לבנות מסלול חדש").waitFor();

  await input.fill("קודי, ספר לנו קצת על המזרקה שאנחנו רואים.");
  await page.locator(".composer button").click();
  await page.getByText("אני יכול להיות רגע מדריך מקומי").waitFor();

  await input.fill("קודי, איפה כולם עכשיו?");
  await page.locator(".composer button").click();
  await page.getByText("אני מסתכל על מצב הטיול").waitFor();

  await input.fill("קודי, מה כדאי לעשות עכשיו? תמליץ על משהו עם מים.");
  await page.locator(".composer button").click();
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
