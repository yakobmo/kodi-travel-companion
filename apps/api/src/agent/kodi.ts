import type { AgeGroup, MemberRole, TripPlace, TripState } from "../domain/types.js";
import type { GooglePlacesTextSearchResult } from "../google/placesSearch.js";
import type { GoogleReverseGeocodeResult } from "../google/reverseGeocode.js";
import type { GoogleRouteEstimateResult } from "../google/routes.js";

export interface ConversationMessage {
  author: string;
  text: string;
  memberId?: string;
  source?: "member" | "agent" | "system";
}

export interface AgentMessageRequest {
  member?: {
    id?: string;
    displayName?: string;
    age?: number;
    ageGroup?: AgeGroup;
    role?: MemberRole;
  };
  message: string;
  recentMessages?: ConversationMessage[];
  selectedPlace?: Pick<TripPlace, "id" | "name" | "type" | "address" | "lat" | "lng" | "note" | "tags">;
  tripState?: TripState;
  externalPlacesSearch?: GooglePlacesTextSearchResult;
  reverseGeocodedLocation?: GoogleReverseGeocodeResult;
  routeEstimate?: GoogleRouteEstimateResult;
  tripContextClarification?: string;
}

export interface AgentMessageResponse {
  author: "קודי";
  text: string;
  intent: "local_guide" | "route_creation" | "family_compromise" | "group_location" | "place_recommendation" | "general";
  requiresAdminApproval: boolean;
  source: "rules" | "openai";
}

interface RecommendationCandidate {
  place: TripPlace;
  score: number;
  reasons: string[];
  caveats: string[];
}

interface ConversationContextSummary {
  speakerNames: string[];
  mentionedNeeds: string[];
  childNames: string[];
  currentDestinationName?: string;
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function joinRecentMessages(messages: ConversationMessage[] = []) {
  return messages
    .slice(-8)
    .map((message) => `${message.author}: ${message.text}`)
    .join(" ");
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function getDistanceKm(first: { lat: number; lng: number }, second: { lat: number; lng: number }) {
  const earthRadiusKm = 6371;
  const latDelta = ((second.lat - first.lat) * Math.PI) / 180;
  const lngDelta = ((second.lng - first.lng) * Math.PI) / 180;
  const firstLat = (first.lat * Math.PI) / 180;
  const secondLat = (second.lat * Math.PI) / 180;
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(firstLat) * Math.cos(secondLat) * Math.sin(lngDelta / 2) * Math.sin(lngDelta / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function summarizeRecentConversation(
  messages: ConversationMessage[] = [],
  currentMessage: string,
  tripState?: TripState
): ConversationContextSummary {
  const recentMessages = messages.slice(-8);
  const allText = `${joinRecentMessages(recentMessages)} ${currentMessage}`;
  const childNames =
    tripState?.members
      .filter((item) => item.member.ageGroup === "child")
      .map((item) => item.member.displayName) ?? [];
  const mentionedNeeds: string[] = [];

  if (includesAny(allText, ["גלידה", "מתוק", "קינוח"])) {
    mentionedNeeds.push("משהו מתוק/גלידה");
  }

  if (includesAny(allText, ["לישון", "עייפ", "מנוחה", "רגוע"])) {
    mentionedNeeds.push("מנוחה וקיצור מאמץ");
  }

  if (includesAny(allText, ["ילדים", "קטנים", ...childNames])) {
    mentionedNeeds.push("התאמה לילדים");
  }

  if (includesAny(allText, ["מים", "בריכה", "מעיין", "חוף", "מזרקה"])) {
    mentionedNeeds.push("מים או נקודת עניין רטובה");
  }

  if (includesAny(allText, ["בלי הליכה", "מעט הליכה", "קרוב", "ליד המלון", "מינימום הליכה"])) {
    mentionedNeeds.push("קרוב ועם מעט הליכה");
  }

  return {
    speakerNames: unique(recentMessages.filter((message) => message.source !== "agent").map((message) => message.author)),
    mentionedNeeds: unique(mentionedNeeds),
    childNames: unique(childNames),
    currentDestinationName: tripState?.groupDestination?.placeName
  };
}

function buildVisibleLocationSummary(tripState?: TripState) {
  if (!tripState) {
    return {
      visibleNames: [],
      hiddenCount: 0,
      totalMembers: 0
    };
  }

  const visibleMembers = tripState.members.filter((item) => item.consent.state === "enabled" && item.liveLocation);
  const hiddenMembers = tripState.members.filter((item) => item.consent.state !== "enabled" || !item.liveLocation);

  return {
    visibleNames: visibleMembers.map((item) => item.member.displayName),
    hiddenCount: hiddenMembers.length,
    totalMembers: tripState.members.length
  };
}

function getRecommendationPreferences(message: string) {
  return {
    wantsWater: includesAny(message, ["מים", "רטוב", "מעיין", "בריכה", "חוף"]),
    wantsFood: includesAny(message, ["אוכל", "גלידה", "מסעדה", "קפה"]),
    wantsKids: includesAny(message, ["ילדים", "קטנים", "משפחה"]),
    wantsMinimalWalking: includesAny(message, ["בלי הליכה", "מעט הליכה", "מינימום הליכה", "קל"])
  };
}

function scorePlace(place: TripPlace, message: string): RecommendationCandidate {
  const preferences = getRecommendationPreferences(message);
  const tagsAndNote = `${place.tags.join(" ")} ${place.note ?? ""}`.toLowerCase();
  const preferredTypes = preferences.wantsWater
    ? ["water", "attraction", "food", "stop", "lodging", "unknown"]
    : preferences.wantsFood
      ? ["food", "attraction", "water", "stop", "lodging", "unknown"]
      : ["attraction", "water", "food", "stop", "lodging", "unknown"];
  const typeRank = preferredTypes.indexOf(place.type);
  const hasCoordinates = typeof place.lat === "number" && typeof place.lng === "number";
  const reasons: string[] = [];
  const caveats: string[] = [];
  let score = typeRank >= 0 ? (preferredTypes.length - typeRank) * 10 : 0;

  if (typeRank === 0) {
    reasons.push(`סוג המקום מתאים לבקשה (${place.type})`);
  }

  if (hasCoordinates) {
    score += 4;
    reasons.push("יש קואורדינטות לפתיחת ניווט");
  } else {
    caveats.push("חסרות קואורדינטות מדויקות");
  }

  if (place.note) {
    score += 2;
    reasons.push("יש הערה שמורה מהמפה");
  }

  if (place.address) {
    score += 1;
    reasons.push("יש כתובת שמורה");
  }

  if (place.visitState === "unvisited") {
    score += 2;
    reasons.push("עדיין לא סומן כביקור שבוצע");
  }

  if (preferences.wantsKids) {
    if (includesAny(tagsAndNote, ["child", "children", "kid", "ילד", "ילדים", "family"])) {
      score += 3;
      reasons.push("יש סימון שמתאים למשפחה/ילדים");
    } else {
      caveats.push("אין עדיין סימון ודאי להתאמה לילדים");
    }
  }

  if (preferences.wantsMinimalWalking) {
    if (hasCoordinates) {
      score += 1;
      reasons.push("אפשר לפתוח ניווט ישיר ולבדוק מסלול קצר");
    }

    caveats.push("אין עדיין חישוב הליכה אמיתי בלי Google Routes");
  }

  return {
    place,
    score,
    reasons,
    caveats
  };
}

function selectRecommendedPlace(message: string, tripState?: TripState) {
  const scored = (tripState?.places ?? [])
    .map((place) => scorePlace(place, message))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score);
  const preferences = getRecommendationPreferences(message);

  return {
    best: scored[0],
    alternatives: scored.slice(1, 3),
    requestedFocus: preferences.wantsWater ? "מים" : preferences.wantsFood ? "אוכל" : "אטרקציה"
  };
}

function summarizePlaceNote(note?: string) {
  if (!note) {
    return null;
  }

  const withoutUrls = note.replace(/https?:\/\/\S+/g, "").replace(/https?:\/?$/g, "").trim();
  const cleaned = withoutUrls.replace(/\s+/g, " ").slice(0, 90).trim();

  return cleaned.length >= 12 ? cleaned : null;
}

function describeRejectedAlternative(candidate: RecommendationCandidate) {
  const reasons: string[] = [];

  if (candidate.caveats.length > 0) {
    reasons.push(candidate.caveats[0]);
  }

  if (!candidate.reasons.some((reason) => reason.includes("סוג המקום מתאים"))) {
    reasons.push("סוג המקום פחות מדויק לבקשה");
  }

  if (reasons.length === 0) {
    reasons.push("הציון הכולל שלה נמוך יותר");
  }

  return `${candidate.place.name} - ${reasons.join(", ")}`;
}

function buildExternalPlacesContext(search?: GooglePlacesTextSearchResult) {
  if (!search) {
    return "";
  }

  if (search.status === "not_configured") {
    return " חיפוש Google Places חי עדיין לא מופעל כי חסר GOOGLE_MAPS_API_KEY, ולכן אני לא אציג מקומות חיצוניים כאילו בדקתי אותם עכשיו.";
  }

  if (search.status === "google_error") {
    return " ניסיתי לבדוק Google Places, אבל Google החזיר שגיאה ולכן אני נשען כרגע על מפת הטיול השמורה.";
  }

  if (search.places.length === 0) {
    return " בדקתי Google Places אבל לא קיבלתי תוצאה חיצונית מספיק טובה לשאלה הזו.";
  }

  const topPlaces = search.places
    .slice(0, 3)
    .map((place) => [place.displayName, place.formattedAddress].filter(Boolean).join(" - "))
    .filter(Boolean)
    .join("; ");

  return topPlaces
    ? ` בנוסף למפת הטיול השמורה, Google Places מציע כרגע: ${topPlaces}.`
    : " קיבלתי תוצאות מ-Google Places, אבל הן חסרות שם או כתובת ברורים ולכן לא אציג אותן כהמלצה מובילה.";
}

function buildRouteEstimateContext(routeEstimate?: GoogleRouteEstimateResult) {
  if (!routeEstimate) {
    return "";
  }

  if (routeEstimate.status === "not_configured") {
    return "חישוב זמן נסיעה חי מ-Google Routes עדיין לא מופעל כי חסר GOOGLE_MAPS_API_KEY.";
  }

  if (routeEstimate.status === "google_error") {
    return "ניסיתי לחשב זמן נסיעה דרך Google Routes, אבל Google החזיר שגיאה ולכן אני לא מציג ETA כאילו הוא נבדק עכשיו.";
  }

  if (!routeEstimate.route) {
    return "Google Routes חזר בלי מסלול ברור, אז אני לא מציג זמן נסיעה.";
  }

  return `לפי Google Routes, זמן ההגעה המשוער הוא ${routeEstimate.route.durationText}, מרחק ${routeEstimate.route.distanceText}.`;
}

function getReverseGeocodedReadableAddress(reverseGeocodedLocation: GoogleReverseGeocodeResult | undefined) {
  if (reverseGeocodedLocation?.status !== "ready") {
    return "";
  }

  return reverseGeocodedLocation.readableAddress ?? reverseGeocodedLocation.formattedAddress ?? "";
}

function getNearbyReadablePlace(
  liveLocation: { lat: number; lng: number } | undefined,
  externalPlacesSearch: GooglePlacesTextSearchResult | undefined
) {
  if (externalPlacesSearch?.status !== "ready") {
    return "";
  }

  const placesWithNames = externalPlacesSearch.places.filter((place) => place.displayName || place.formattedAddress);
  const nearbyWithDistance = liveLocation
    ? placesWithNames
        .filter((place) => typeof place.lat === "number" && typeof place.lng === "number")
        .map((place) => ({
          place,
          distanceKm: getDistanceKm(liveLocation, { lat: Number(place.lat), lng: Number(place.lng) })
        }))
        .filter((item) => item.distanceKm <= 2)
        .sort((first, second) => first.distanceKm - second.distanceKm)
    : [];
  const selectedPlace = nearbyWithDistance[0]?.place ?? placesWithNames[0];

  return selectedPlace ? [selectedPlace.displayName, selectedPlace.formattedAddress].filter(Boolean).join(" - ") : "";
}

function buildCurrentLocationAnswer(
  memberId: string | undefined,
  memberName: string,
  reverseGeocodedLocation: GoogleReverseGeocodeResult | undefined,
  externalPlacesSearch: GooglePlacesTextSearchResult | undefined,
  tripState: TripState | undefined
) {
  const visibleMember =
    tripState?.members.find((item) => item.member.id === memberId && item.consent.state === "enabled" && item.liveLocation) ??
    tripState?.members.find(
      (item) => item.member.displayName === memberName && item.consent.state === "enabled" && item.liveLocation
    );
  const updatedAt = visibleMember?.liveLocation?.updatedAt
    ? new Date(visibleMember.liveLocation.updatedAt).toLocaleString("he-IL", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "Asia/Jerusalem"
      })
    : undefined;
  const accuracyText =
    typeof visibleMember?.liveLocation?.accuracyMeters === "number"
      ? ` דיוק GPS משוער: ${Math.round(visibleMember.liveLocation.accuracyMeters)} מטר.`
      : "";
  const timeText = updatedAt ? ` עדכון אחרון: ${updatedAt}.` : "";
  const liveLocation = visibleMember?.liveLocation;
  const nearestPlaceText = getNearbyReadablePlace(liveLocation ?? undefined, externalPlacesSearch);
  const reverseGeocodedAddress = getReverseGeocodedReadableAddress(reverseGeocodedLocation);

  if (nearestPlaceText) {
    const addressText =
      reverseGeocodedAddress
        ? ` הכתובת ש-Google מזהה סביב הנקודה: ${reverseGeocodedAddress}.`
        : "";
    return `${memberName}, לפי המיקום החי שלך נראה שאתה ב/ליד ${nearestPlaceText}.${addressText}${accuracyText}${timeText}`;
  }

  if (reverseGeocodedAddress) {
    return `${memberName}, לפי המיקום החי שלך אתה עכשיו ב-${reverseGeocodedAddress}.${accuracyText}${timeText}`;
  }

  if (visibleMember?.liveLocation) {
    return (
      `${memberName}, אני רואה מיקום חי, אבל כרגע Google לא החזיר לי שם רחוב או נקודת ציון ברורה.` +
      `${accuracyText}${timeText} כדאי ללחוץ על רענון מיקום ולשאול שוב; המענה שלי צריך להיות שם מקום קריא.`
    );
  }

  return `${memberName}, אין לי כרגע מיקום חי שלך. לחץ על "מיקום נוכחי" ואחרי שהדפדפן מאשר מיקום אשיב לפי המקום האמיתי שלך.`;
}

export function buildKodiReplyFromContext(input: AgentMessageRequest): AgentMessageResponse {
  const message = input.message.trim();
  const recentText = joinRecentMessages(input.recentMessages);
  const allContext = `${recentText} ${message}`;
  const memberName = input.member?.displayName ?? "אני";
  const selected = input.selectedPlace?.name ?? "המלון הקרוב";
  const locationSummary = buildVisibleLocationSummary(input.tripState);
  const conversationSummary = summarizeRecentConversation(input.recentMessages, message, input.tripState);
  const needsText =
    conversationSummary.mentionedNeeds.length > 0
      ? conversationSummary.mentionedNeeds.join(", ")
      : "העדפה כללית לטיול נוח";
  const speakersText =
    conversationSummary.speakerNames.length > 0 ? conversationSummary.speakerNames.join(", ") : memberName;
  const destinationText = conversationSummary.currentDestinationName
    ? ` היעד הקבוצתי הנוכחי הוא ${conversationSummary.currentDestinationName}, ולכן לא אשנה אותו בלי אישור מנהל.`
    : "";
  const externalPlacesContext = buildExternalPlacesContext(input.externalPlacesSearch);
  const routeEstimateContext = buildRouteEstimateContext(input.routeEstimate);

  if (includesAny(message, ["איפה אני", "איפה אני עכשיו", "מיקום נוכחי", "אתה רואה אותי", "איפה אנחנו"])) {
    return {
      author: "קודי",
      intent: "group_location",
      requiresAdminApproval: false,
      source: "rules",
      text: buildCurrentLocationAnswer(
        input.member?.id,
        memberName,
        input.reverseGeocodedLocation,
        input.externalPlacesSearch,
        input.tripState
      )
    };
  }

  if (input.tripContextClarification) {
    return {
      author: "קודי",
      intent: "group_location",
      requiresAdminApproval: false,
      source: "rules",
      text: input.tripContextClarification
    };
  }

  if (routeEstimateContext) {
    return {
      author: "קודי",
      intent: "group_location",
      requiresAdminApproval: false,
      source: "rules",
      text:
        `${memberName}, ${routeEstimateContext} ` +
        "אם מנהל מאשר, אפשר לפתוח את אותה נקודה ב-Waze או Google Maps. מבחינתי Waze הוא רק קישור ניווט לנקודה, לא מקור הידע של הטיול."
    };
  }

  if (includesAny(message, ["צ'יינג", "צ׳יינג", "change", "exchange", "יורו", "מזומן", "כסף", "תקציב", "להביא מהבית"])) {
    return {
      author: "קודי",
      intent: "general",
      requiresAdminApproval: false,
      source: "rules",
      text:
        `${memberName}, זו בדיוק שאלה של סוכן טיול ולא של רשימת אטרקציות. ` +
        "ברמת ההיגיון הטיולי: בצפון יוון ובאזורים כפריים כמו צומרקה, זגוריה ופיליון לא כדאי לבנות על זמינות גבוהה של צ׳יינג׳ בכל נקודה. " +
        "בערים גדולות, שדות תעופה ואזורים תיירותיים יש יותר סיכוי, אבל בכפרים, כבישים הרריים וחופים מרוחקים עדיף להגיע עם בסיס יורו מהבית או למשוך בעיר גדולה מראש. " +
        "כשיהיה חיבור חי מלא, אני אמור לבדוק סביב המלון/היעד הספציפי שלכם: בנקים, ATM, exchange, שעות פתיחה, דירוגים ומרחק נסיעה, ואז להמליץ כמה מזומן לשמור בצד לפי ימי הטיול, אוכל, דלק, חניה, טיפים, אטרקציות ומקרי חירום. " +
        "המלצת גיבוי זהירה עכשיו: לא להשאיר את זה לצפון יוון עצמו; להגיע עם סכום בסיסי ביורו ולתכנן השלמה במקום גדול בדרך."
    };
  }

  if (includesAny(message, ["כאן", "לידי", "לידינו", "בסביבה", "כאן ועכשיו", "באר שבע", "near me", "around me"])) {
    return {
      author: "קודי",
      intent: "place_recommendation",
      requiresAdminApproval: false,
      source: "rules",
      text:
        `${memberName}, הבנתי: כרגע עובדים במצב כאן ועכשיו, לא לפי מסלול יוון. ` +
        "אני מתייחס למיקום החי שלכם כנקודת העוגן ומחפש סביבכם, כשהמסלול המתוכנן נשאר רק ברקע. " +
        `${externalPlacesContext} ` +
        "כש-Google Places פעיל, אני אמור להביא מקומות אמיתיים סביב המיקום הנוכחי, להשוות ביניהם, להסביר למה אחד עדיף, ואז לאפשר לפתוח אותו ב-Google Maps או Waze. " +
        "אם תרצו להוסיף מקום שמצאתי למפה, אבקש אישור מנהל ואז אוסיף אותו לשכבת הטיול של קודי."
    };
  }

  if (includesAny(message, ["מה כדאי", "מה לעשות", "לאן ללכת", "תמליץ", "המלצה", "הכי טוב", "משהו עם מים"])) {
    const recommendation = selectRecommendedPlace(message, input.tripState);
    const best = recommendation.best;

    if (!best) {
      return {
        author: "קודי",
        intent: "place_recommendation",
        requiresAdminApproval: false,
        source: "rules",
        text:
          "אני רוצה להמליץ מתוך מפת הטיול, אבל כרגע אין לי נקודות זמינות ב-TripState. צריך לוודא שהסנכרון מגוגל נטען לפני שאבחר יעד."
      };
    }

    const cleanNote = summarizePlaceNote(best.place.note);
    const reasonsText = best.reasons.slice(0, 4).join("; ");
    const caveatsText = best.caveats.length > 0 ? ` מגבלות: ${best.caveats.join("; ")}.` : "";
    const alternativesText =
      recommendation.alternatives.length > 0
        ? ` חלופות שדחיתי כרגע: ${recommendation.alternatives.map(describeRejectedAlternative).join("; ")}.`
        : " אין לי כרגע חלופות מספיק טובות להשוואה מתוך הנתונים הזמינים.";

    return {
      author: "קודי",
      intent: "place_recommendation",
      requiresAdminApproval: true,
      source: "rules",
      text:
        `ההמלצה שלי כרגע היא ${best.place.name}. בחרתי אותה כי היא מתאימה לבקשת ${recommendation.requestedFocus}. ` +
        `מהשיחה האחרונה קלטתי את הצרכים האלה: ${needsText}. ` +
        `הנימוקים המרכזיים: ${reasonsText || "זו הנקודה החזקה ביותר לפי הנתונים השמורים"}. ` +
        `${cleanNote ? `הערה שמורה: ${cleanNote}. ` : "היא קיימת במפת הטיול השמורה. "}` +
        "אני לא קובע עדיין זמן נסיעה, עומס, שעות פתיחה או מרחק הליכה אמיתי בלי Google Routes/Places." +
        `${destinationText}${externalPlacesContext}${caveatsText}${alternativesText} אם מנהל מאשר, אוכל לפתוח ניווט או להפוך אותה ליעד הקבוצתי הבא.`
    };
  }

  if (includesAny(message, ["ספר", "רואים", "מזרקה", "תסביר", "מה הסיפור", "מדריך"])) {
    return {
      author: "קודי",
      intent: "local_guide",
      requiresAdminApproval: false,
      source: "rules",
      text:
        `${memberName}, אני יכול להיות רגע מדריך מקומי. לפי ההקשר אני צריך לזהות בדיוק איפה אתם או איזו נקודה נבחרה, ` +
        "ואז אסביר בקצרה מה רואים, למה זה מעניין, ואתאים את ההסבר לילדים בלי להמציא עובדות שאני לא בטוח בהן."
    };
  }

  if (includesAny(message, ["מסלול", "שעה פנויה", "מזרקות", "בנה", "צור", "הליכה רגלית"])) {
    return {
      author: "קודי",
      intent: "route_creation",
      requiresAdminApproval: true,
      source: "rules",
      text:
        "אני יכול לבנות מסלול חדש, אבל קודם צריך לאפיין אותו. כמה זמן יש לכם, האם זה ברגל או ברכב, מה דרגת הקושי הרצויה, " +
        `מי בקבוצה עכשיו, ומה מעניין אתכם: מים, אוכל, היסטוריה, ילדים או משהו רגוע ליד המלון? מהשיחה קלטתי כרגע: ${needsText}.${destinationText} אחרי זה אציע מסלול ואבקש אישור מנהל לפני שינוי יעד קבוצתי.`
    };
  }

  if (includesAny(message, ["איפה", "כולם", "מיקום", "נפגשים", "קרוב למי"])) {
    const visibleNames =
      locationSummary.visibleNames.length > 0 ? locationSummary.visibleNames.join(", ") : "אף אחד עדיין לא משתף מיקום";
    const hiddenText =
      locationSummary.hiddenCount > 0
        ? ` יש ${locationSummary.hiddenCount} חברי קבוצה שלא מציגים מיקום כרגע, ואני לא חושף אותם בלי הסכמה.`
        : "";

    return {
      author: "קודי",
      intent: "group_location",
      requiresAdminApproval: false,
      source: "rules",
      text:
        `אני מסתכל על מצב הטיול. כרגע אני רואה מיקום משותף של: ${visibleNames}.${hiddenText} ` +
        `מהשיחה האחרונה קלטתי גם את הצרכים האלה: ${needsText}.${destinationText} ` +
        "אפשר להשתמש בזה כדי להציע נקודת מפגש, אבל שינוי יעד קבוצתי עדיין דורש אישור מנהל."
    };
  }

  if (includesAny(allContext, ["גלידה", "לישון", "מלון", "עייפ", "ילדים"])) {
    return {
      author: "קודי",
      intent: "family_compromise",
      requiresAdminApproval: true,
      source: "rules",
      text:
        `שמעתי את ${speakersText}. מהשיחה אני מזהה: ${needsText}. הייתי מחפש נקודה קלה ליד ${selected}, ` +
        `עם מינימום הליכה ובלי לדחוף את כולם לכיוון שלא מתאים לילדים.${destinationText}${externalPlacesContext} אני יכול להציע מקום, ואז אבקש אישור מנהל לפני שינוי יעד קבוצתי.`
    };
  }

  return {
    author: "קודי",
    intent: "general",
    requiresAdminApproval: false,
    source: "rules",
    text:
      `אני כאן בשיחה. קראתי את ההודעות האחרונות של ${speakersText}, ואני מזהה כרגע: ${needsText}.${destinationText} אם תרצו אעזור למצוא מכנה משותף ולהפוך את זה להחלטה פשוטה: המלצה, הסבר וניווט.`
  };
}
