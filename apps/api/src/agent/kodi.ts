import type { AgeGroup, MemberRole, TripPlace, TripState } from "../domain/types.js";
import type { GooglePlacesTextSearchResult } from "../google/placesSearch.js";
import type { GoogleReverseGeocodeResult } from "../google/reverseGeocode.js";
import type { GoogleRouteEstimateResult } from "../google/routes.js";
import { buildTripTimelineFromGoogleMapOrder } from "./tripTimelineResolver.js";

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
  recommendedPlaceId?: string;
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

function shouldResetStaleConversationContext(text: string) {
  return includesAny(text, [
    "יצאת מהשיחה",
    "לא זה",
    "לא הבנת",
    "אוורוף זה סוף",
    "Averof זה סוף",
    "אנחנו נוחתים באתונה",
    "נוחתים באתונה",
    "המלון הראשון",
    "מלון ראשון",
    "מאריתה",
    "מארתה",
    "Marathia"
  ]);
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
  const recentMessages = shouldResetStaleConversationContext(currentMessage) ? [] : messages.slice(-8);
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
    currentDestinationName: shouldResetStaleConversationContext(allText) ? undefined : tripState?.groupDestination?.placeName
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

function isWholeTripOverviewQuestion(message: string) {
  const normalized = message.toLowerCase();

  return (
    includesAny(normalized, [
      "מה אופי הטיול",
      "אופי הטיול",
      "מה זה הטיול",
      "איזה טיול זה",
      "מה מחכה לנו",
      "מה מצפה לנו",
      "ספר על הטיול",
      "תאר את הטיול",
      "מסלול הטיול כולו",
      "כל הטיול",
      "התמונה הגדולה",
      "overview",
      "trip overview",
      "what kind of trip"
    ]) &&
    includesAny(normalized, ["טיול", "יוון", "מסלול", "trip", "greece"])
  );
}

function isTripRouteDiagramRequest(message: string) {
  const normalized = message.toLowerCase();

  return (
    includesAny(normalized, [
      "תרשים",
      "שרטוט",
      "ציור",
      "סכמה",
      "מפת מסלול",
      "מפה של מסלול",
      "תראה לי מסלול",
      "תראה את המסלול",
      "צייר לי",
      "סמן לי על המפה",
      "סמן את המסלול",
      "diagram",
      "route map",
      "map diagram"
    ]) &&
    includesAny(normalized, ["מסלול", "טיול", "מפה", "יוון", "trip", "route", "map"])
  );
}

function isLodgingOrderQuestion(message: string) {
  const normalized = message.toLowerCase();
  const asksAboutLodging = includesAny(normalized, [
    "מלונות",
    "מלון",
    "לינות",
    "לינה",
    "איפה ישנים",
    "איפה ישן",
    "איפה נישן",
    "איפה לנים",
    "איפה לינה",
    "sleep",
    "hotel",
    "lodging"
  ]);
  const asksForOrder = includesAny(normalized, [
    "לפי הסדר",
    "בסדר",
    "הסדר",
    "ראשון",
    "אחרון",
    "שרשרת",
    "רצף",
    "timeline",
    "order"
  ]);

  return asksAboutLodging && (asksForOrder || includesAny(normalized, ["מה המלונות", "מקומות לינה", "איפה ישנים"]));
}

function buildLodgingOrderAnswer(memberName: string, message: string, tripState?: TripState) {
  const timeline = tripState ? buildTripTimelineFromGoogleMapOrder(tripState) : [];
  const normalized = message.toLowerCase();
  const onlyAthens = includesAny(normalized, ["אתונה", "athens", "athina"]);
  const athensSegments = timeline.filter((segment) => placeRegionText(segment.lodging) === "אתונה");
  const relevantSegments = onlyAthens && athensSegments.length > 0 ? athensSegments : timeline;

  if (relevantSegments.length === 0) {
    return `${memberName}, אני לא רואה כרגע שרשרת לינות מסודרת מתוך מפת הטיול. כדי לענות אמין צריך שהסנכרון מגוגל יביא נקודות מסוג לינה עם סדר מקור מהמפה.`;
  }

  const rows = relevantSegments
    .slice(0, 12)
    .map((segment, index) => {
      const region = placeRegionText(segment.lodging);
      const address = segment.lodging.address ? ` - ${segment.lodging.address}` : "";
      return `${index + 1}. ${segment.lodging.name} (${region})${address}`;
    })
    .join("\n");
  const intro = onlyAthens && athensSegments.length > 0
    ? "באזור אתונה, מתוך מפת הטיול, אני רואה את הלינה הזו:"
    : onlyAthens
      ? "לא מצאתי סימון לינה שמזוהה אצלי חד-משמעית כאתונה, אז אני מציג את שרשרת הלינות מהמפה לפי הסדר:"
    : "לפי מפת הטיול והסדר שמגיע מגוגל, שרשרת הלינות שאני רואה היא:";

  return [
    `${memberName}, ${intro}`,
    rows,
    "אני מתייחס לזה כבסיס העבודה של המסלול; אם הסדר בגוגל משתנה, זה צריך להתעדכן בסנכרון הבא ולא דרך ניחוש."
  ].join("\n\n");
}

function placeRegionText(place: Pick<TripPlace, "name" | "address" | "note"> & Partial<Pick<TripPlace, "tags">>) {
  const text = `${place.name} ${place.address ?? ""} ${(place.tags ?? []).join(" ")} ${place.note ?? ""}`.toLowerCase();
  if (includesAny(text, ["athens", "אתונה", "averof"])) return "אתונה";
  if (includesAny(text, ["arta", "chanopoulo", "marathia", "tzoumerka", "צומרקה", "ארטה"])) return "צומרקה / ארטה";
  if (includesAny(text, ["zagori", "papingo", "voidomatis", "vikos", "זגור", "פפיגו", "ויקוס"])) return "זגוריה";
  if (includesAny(text, ["pelion", "mouresi", "tsagarada", "pilion", "פיליון", "מורסי", "צגראדה"])) return "חצי האי פיליון";
  if (includesAny(text, ["rio", "antirrio", "antirio", "גשר"])) return "דרך צפונה / גשר ריו-אנטיריו";
  return "נקודות בדרך";
}

function buildTripRouteDiagramAnswer(memberName: string, tripState?: TripState) {
  const places = [...(tripState?.places ?? [])].sort((a, b) => (a.sourceIndex ?? 9999) - (b.sourceIndex ?? 9999));
  const findAnchor = (terms: string[], preferredTypes: TripPlace["type"][] = ["lodging", "transport", "stop", "attraction"]) => {
    for (const term of terms) {
      const matched = places.find((place) => {
        const haystack = `${place.name} ${place.address ?? ""} ${place.tags.join(" ")} ${place.note ?? ""}`.toLowerCase();
        return preferredTypes.includes(place.type) && haystack.includes(term.toLowerCase());
      });
      if (matched) {
        return matched;
      }
    }

    return undefined;
  };
  const anchors = [
    findAnchor(["athens", "ath", "נמל התעופה", "אתונה"], ["transport", "stop", "lodging"]),
    findAnchor(["rio-antirrio", "rio antirrio", "antirrio", "antirio"], ["attraction", "stop", "transport"]),
    findAnchor(["marathia", "chanopoulo", "מאר", "arta", "ארטה"], ["lodging", "stop"]),
    findAnchor(["tzoumerka", "pramanta", "orizontes", "צומרקה", "פרמנטה"], ["lodging", "attraction", "stop"]),
    findAnchor(["zagori", "aristi", "papingo", "vikos", "זגור", "פפיגו", "ויקוס"], ["lodging", "attraction", "water", "stop"]),
    findAnchor(["pelion", "mouresi", "tsagarada", "damouchari", "chorefto", "פיליון", "מורסי"], [
      "lodging",
      "attraction",
      "water",
      "stop"
    ]),
    findAnchor(["athens", "אתונה", "airport"], ["lodging", "transport", "stop"])
  ].filter((place, index, list): place is TripPlace => Boolean(place) && list.findIndex((item) => item?.id === place?.id) === index);

  if (anchors.length === 0) {
    return `${memberName}, אין לי כרגע מספיק נקודות מסודרות כדי לצייר תרשים מסלול אמין. שלח לי קישור מפת Google Maps או בחר רשימת נקודות, ואז אבנה מיד תרשים לפי הסדר.`;
  }

  const routeLine = "אתונה נחיתה -> גשר ריו-אנטיריו / מעבר צפונה -> ארטה / צומרקה -> זגוריה -> חצי האי פיליון -> אתונה סיום";
  const anchorsText = anchors
    .map((place, index) => `${index + 1}. ${place.name}${place.address ? ` - ${place.address}` : ""}`)
    .join("\n");

  const coordinateAnchors = anchors.filter((place) => typeof place.lat === "number" && typeof place.lng === "number").slice(0, 9);
  const mapsLink =
    coordinateAnchors.length >= 2
      ? `https://www.google.com/maps/dir/${coordinateAnchors
          .map((place) => `${place.lat},${place.lng}`)
          .map(encodeURIComponent)
          .join("/")}`
      : undefined;

  return [
    `${memberName}, כן. הנה תרשים מסלול בסיסי לפי סדר הנקודות שאני רואה ממפת הטיול, בלי להמציא שלבים שאין לי.`,
    routeLine || "אתונה -> צפון יוון -> זגוריה -> פיליון -> אתונה",
    `עוגני המסלול מתוך המפה:\n${anchorsText}`,
    mapsLink ? `קישור פתיחה ב-Google Maps לתרשים נסיעה ראשוני: ${mapsLink}` : "אין לי מספיק קואורדינטות רציפות כדי לבנות קישור Google Maps מלא, אבל התרשים מעל מבוסס על סדר נקודות הטיול.",
    "אם תרצה, השלב הבא שלי הוא להפוך את זה למסלול לפי ימים: לינה, נסיעה, עצירות מומלצות, ומה כדאי לדחות."
  ].join("\n\n");
}

function buildWholeTripOverviewAnswer(memberName: string, tripState?: TripState) {
  const places = tripState?.places ?? [];
  const placesCount = places.length;
  const lodgingCount = places.filter((place) => place.type === "lodging").length;
  const attractionCount = places.filter((place) => place.type === "attraction").length;
  const waterCount = places.filter((place) => place.type === "water").length;
  const foodCount = places.filter((place) => place.type === "food").length;
  const countText =
    placesCount > 0
      ? ` כרגע אני רואה במפת הטיול ${placesCount} נקודות: ${lodgingCount} לינות, ${attractionCount} אטרקציות, ${waterCount} נקודות מים/חופים ו-${foodCount} נקודות אוכל.`
      : "";

  return (
    `${memberName}, זה טיול מעגלי ביוון, לא ביקור עירוני קצר. ` +
    "האופי שלו הוא טבע, נסיעות נוף, הרים, כפרים, מים, גשרים, תצפיות ולינות שמחלקות את הדרך: נחיתה באתונה, עליה לצפון יוון וצומרקה, המשך לזגוריה, מעבר לחצי האי פיליון, ואז חזרה לאתונה לסיום. " +
    "זה אומר שהקצב הנכון הוא לא לרוץ מנקודה לנקודה, אלא לבחור בכל יום עוגן טוב: איפה ישנים, כמה כוח יש לילדים, כמה נסיעה נשארה, ומה מזג האוויר מאפשר. " +
    "בפועל אני אמור לעזור לכם בדיוק שם: להבין איפה אתם במסלול, מה קרוב אליכם עכשיו או ליעד הבא, מה מתאים למשפחה, מתי לפתוח Waze/Google Maps, ומתי לוותר על חלופה פחות מתאימה." +
    countText +
    " אם תרצה, השלב הבא שלי יכול להיות לסדר לכם את הטיול לפי ימים/לינות ולתת לכל יום כותרת קצרה וברורה."
  );
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
    return " אין לי כרגע תוצאות Google Places חיות לשאלה הזו, אז אני נשען על מפת הטיול וההיגיון המקומי בלי להמציא דירוגים או שעות פתיחה.";
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

function isConcreteNearbyPlaceNeed(message: string) {
  return includesAny(message.toLowerCase(), [
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
    "atm",
    "חוף",
    "beach",
    "אטרקציה",
    "attraction"
  ]);
}

function buildWazeUrl(place: GooglePlacesTextSearchResult["places"][number]) {
  if (typeof place.lat !== "number" || typeof place.lng !== "number") {
    return undefined;
  }

  return `https://waze.com/ul?ll=${encodeURIComponent(`${place.lat},${place.lng}`)}&navigate=yes`;
}

function formatLivePlace(place: GooglePlacesTextSearchResult["places"][number], index: number) {
  const name = place.displayName ?? "מקום ללא שם ברור";
  const address = place.formattedAddress ? `, ${place.formattedAddress}` : "";
  const rating =
    typeof place.rating === "number"
      ? `, דירוג ${place.rating}${typeof place.userRatingCount === "number" ? ` (${place.userRatingCount} ביקורות)` : ""}`
      : "";
  const maps = place.googleMapsUri ? ` Google Maps: ${place.googleMapsUri}` : "";
  const wazeUrl = buildWazeUrl(place);
  const waze = wazeUrl ? ` Waze: ${wazeUrl}` : "";

  return `${index + 1}. ${name}${address}${rating}.${maps}${waze}`;
}

function buildConcreteLivePlacesAnswer(
  memberName: string,
  message: string,
  search?: GooglePlacesTextSearchResult
) {
  if (!search || !search.configured) {
    return `${memberName}, כדי לענות על זה נכון אני צריך תוצאות Google Places חיות סביב המיקום הנוכחי. כרגע החיפוש החי לא מוגדר, אז לא אמציא מקום.`;
  }

  if (search.status === "google_error") {
    return `${memberName}, ניסיתי לבדוק ב-Google Places סביב המיקום הנוכחי, אבל Google החזיר שגיאה. לא אשלוף לך מקום לא אמין.`;
  }

  const places = search.places.filter((place) => place.displayName || place.formattedAddress).slice(0, 3);

  if (places.length === 0) {
    return `${memberName}, בדקתי ב-Google Places סביב המיקום הנוכחי ולא קיבלתי מקום מספיק ברור לשאלה הזו. אפשר לרענן מיקום ולנסות שוב.`;
  }

  const need = includesAny(message, ["בית קפה", "קפה", "coffee", "cafe"])
    ? "בית קפה"
    : includesAny(message, ["מאפייה", "מאפיה", "bakery"])
      ? "מאפייה"
      : includesAny(message, ["מסעדה", "טברנה", "restaurant", "taverna"])
        ? "מסעדה"
        : "מקום";

  return (
    `${memberName}, מצאתי ${need} לפי Google Places סביב המיקום הנוכחי. הייתי מתחיל מהאפשרות הראשונה, ואם היא לא מתאימה בודק את השנייה: ` +
    places.map(formatLivePlace).join(" ")
  );
}

function buildRouteEstimateContext(routeEstimate?: GoogleRouteEstimateResult) {
  if (!routeEstimate) {
    return "";
  }

  if (routeEstimate.status === "not_configured") {
    return "אין לי כרגע חישוב נסיעה חי מ-Google Routes, אז אתן הערכה זהירה לפי ההקשר ולא אציג ETA כאילו נבדק עכשיו.";
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
  const memberName = input.member?.displayName ?? "אני";
  const selected = input.selectedPlace?.name ?? "המלון הקרוב";
  const locationSummary = buildVisibleLocationSummary(input.tripState);
  const conversationSummary = summarizeRecentConversation(input.recentMessages, message, input.tripState);
  const needsText = conversationSummary.mentionedNeeds.length > 0 ? conversationSummary.mentionedNeeds.join(", ") : "";
  const externalPlacesContext = buildExternalPlacesContext(input.externalPlacesSearch);
  const routeEstimateContext = buildRouteEstimateContext(input.routeEstimate);

  if (isTripRouteDiagramRequest(message)) {
    return {
      author: "קודי",
      intent: "route_creation",
      requiresAdminApproval: false,
      source: "rules",
      text: buildTripRouteDiagramAnswer(memberName, input.tripState)
    };
  }

  if (isWholeTripOverviewQuestion(message)) {
    return {
      author: "קודי",
      intent: "general",
      requiresAdminApproval: false,
      source: "rules",
      text: buildWholeTripOverviewAnswer(memberName, input.tripState)
    };
  }

  if (isLodgingOrderQuestion(message)) {
    return {
      author: "קודי",
      intent: "general",
      requiresAdminApproval: false,
      source: "rules",
      text: buildLodgingOrderAnswer(memberName, message, input.tripState)
    };
  }

  if (
    includesAny(message, [
      "איפה אני",
      "איפה אני עכשיו",
      "מיקום נוכחי",
      "אתה רואה אותי",
      "איפה אנחנו",
      "באיזה יישוב",
      "באיזה ישוב",
      "איזה יישוב",
      "איזה ישוב",
      "מה הכתובת",
      "איזה רחוב"
    ])
  ) {
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
        `${routeEstimateContext} ` +
        "אפשר לפתוח את הנקודה ב-Waze או Google Maps כשאתם רוצים להתחיל ניווט."
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

  if (
    isConcreteNearbyPlaceNeed(message) &&
    input.externalPlacesSearch?.status === "ready" &&
    input.externalPlacesSearch.places.length > 0
  ) {
    return {
      author: "קודי",
      intent: "place_recommendation",
      requiresAdminApproval: false,
      source: "rules",
      text: buildConcreteLivePlacesAnswer(memberName, message, input.externalPlacesSearch)
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
        "אם יש כמה אפשרויות טובות, אבחר את זו שהכי מתאימה למרחק, זמן, ילדים ונוחות, ואז אפשר לפתוח אותה ב-Google Maps או Waze."
    };
  }

  if (includesAny(message, ["שנורקל", "צלילה", "snorkel"])) {
    return {
      author: "קודי",
      intent: "place_recommendation",
      requiresAdminApproval: false,
      source: "rules",
      text:
        `${memberName}, כן, בפיליון יש איפה לעשות שנורקל, אבל צריך לכוון את הציפייה: זה לא שנורקל טרופי, אלא מפרצים, מים צלולים יחסית, סלעים, דגים קטנים וחוויית ים רגועה. ` +
        "מתוך אופי המסלול שלכם הייתי מחפש בעיקר סביב Damouchari, Papa Nero, Plaka, Mylopotamos וחופים שקטים ליד Chorefto. " +
        "למשפחה עדיף יום עם ים שקט, בוקר מוקדם, כניסה ליד סלעים או קצה חוף ולא באמצע רצועת רחצה עמוסה. " +
        `${externalPlacesContext ? `${externalPlacesContext} ` : ""}` +
        "אם רוצים לשדרג את זה, שווה לשלב עם סירה קטנה בלי סקיפר במפרץ רגוע, ואז אפשר להגיע לפינות טובות יותר לשחייה ושנורקל. Google Maps מתאים כאן לבדיקה רגלית/חוף, ו-Waze רק אם נוסעים לנקודת החוף."
    };
  }

  if (
    !includesAny(message, ["מה כדאי לדעת", "כדאי לדעת", "לדעת היום"]) &&
    includesAny(message, ["מה כדאי לעשות", "מה כדאי לראות", "מה לעשות", "לאן ללכת", "תמליץ", "המלצה", "הכי טוב", "משהו עם מים"])
  ) {
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
      recommendedPlaceId: best.place.id,
      text:
        `ההמלצה שלי כרגע היא ${best.place.name}. בחרתי אותה כי היא מתאימה לבקשת ${recommendation.requestedFocus}. ` +
        `${needsText ? `העדפתי לשקלל גם: ${needsText}. ` : ""}` +
        `הנימוקים המרכזיים: ${reasonsText || "זו הנקודה החזקה ביותר לפי הנתונים השמורים"}. ` +
        `${cleanNote ? `הערה שמורה: ${cleanNote}. ` : "היא קיימת במפת הטיול השמורה. "}` +
        "אני לא קובע עדיין זמן נסיעה, עומס, שעות פתיחה או מרחק הליכה אמיתי בלי Google Routes/Places." +
        `${externalPlacesContext}${caveatsText}${alternativesText}`
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
        `ומה מעניין אתכם: מים, אוכל, היסטוריה, ילדים או משהו רגוע ליד המלון?${needsText ? ` אני גם לוקח בחשבון: ${needsText}.` : ""} אחרי זה אציע מסלול ברור עם נקודות במפה.`
    };
  }

  if (
    input.externalPlacesSearch?.status === "ready" &&
    input.externalPlacesSearch.places.length > 0 &&
    includesAny(message, [
      "סירה",
      "סירות",
      "השכר",
      "טברנה",
      "מסעדה",
      "בית קפה",
      "קפה",
      "מאפייה",
      "מאפיה",
      "סושי",
      "פיצה",
      "גלידה",
      "חוף",
      "דלק",
      "שירותים",
      "בית חבד",
      "בית חב\"ד",
      "ראפטינג",
      "שנורקל",
      "צלילה",
      "snorkel",
      "קיר טיפוס"
    ])
  ) {
    return {
      author: "קודי",
      intent: "place_recommendation",
      requiresAdminApproval: false,
      source: "rules",
      text:
        `כן, יש באזור אפשרויות רלוונטיות. ${externalPlacesContext} ` +
        "הייתי בודק קודם את המרחק מהמלון/המיקום שלכם, זמינות, ביקורות עדכניות ותנאי דרך או ים אם זה פעילות חוץ. " +
        "אם זו פעילות כמו סירה, כדאי לוודא מזג אוויר, ביטוח, רישיון נדרש, שעות החזרה ועלות סופית לפני שסוגרים."
    };
  }

  if (includesAny(message, ["איפה כולם", "איפה כל", "מיקום הקבוצה", "מיקום של", "כולם", "נפגשים", "קרוב למי"])) {
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
        `${needsText ? `אני גם לוקח בחשבון: ${needsText}. ` : ""}` +
        "אפשר להשתמש בזה כדי להציע נקודת מפגש נוחה."
    };
  }

  if (
    !isConcreteNearbyPlaceNeed(message) &&
    !isLodgingOrderQuestion(message) &&
    !isWholeTripOverviewQuestion(message) &&
    includesAny(message, ["גלידה", "לישון", "מלון", "עייפ", "ילדים"])
  ) {
    return {
      author: "קודי",
      intent: "family_compromise",
      requiresAdminApproval: true,
      source: "rules",
      text:
        `אפשר לחפש נקודה קלה ליד ${selected}, עם מינימום הליכה ובלי לדחוף את כולם לכיוון שלא מתאים לילדים. ` +
        `${needsText ? `הכיוון שאני לוקח בחשבון: ${needsText}. ` : ""}` +
        externalPlacesContext
    };
  }

  return {
    author: "קודי",
    intent: "general",
    requiresAdminApproval: false,
    source: "rules",
    text:
      "לא קיבלתי מספיק הקשר כדי לבצע פעולה טובה. כתבו לי מה לבדוק או מה לעשות בטיול, ואענה לפי המפה, המיקום ונקודות המסלול."
  };
}
