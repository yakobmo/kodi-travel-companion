export const demoTripSummary = {
  name: "צפון יוון",
  totalPlaces: 108,
  lodgingCount: 10,
  waterCount: 23,
  groupName: "משפחת כהן"
};

export const demoPlaces = [
  {
    id: "hotel-marathia",
    name: "Hotel Marathia",
    type: "lodging" as const,
    note: "לינה לילה ראשון",
    tags: ["lodging"],
    lat: 39.2515,
    lng: 22.7516
  },
  {
    id: "pozar-baths",
    name: "Pozar Baths",
    type: "water" as const,
    note: "מועמד לאטרקציית מים",
    tags: ["water"]
  },
  {
    id: "stone-forest",
    name: "Stone Forest",
    type: "attraction" as const,
    note: "נקודה מרשימה",
    tags: ["attraction"]
  }
];

export const demoMembers = [
  {
    id: "dad",
    name: "אבא",
    role: "admin",
    ageGroup: "adult",
    locationSharing: "enabled",
    liveLocation: {
      lat: 39.2518,
      lng: 22.752,
      label: "ליד המלון",
      updatedMinutesAgo: 2
    }
  },
  {
    id: "mom",
    name: "אמא",
    role: "owner",
    ageGroup: "adult",
    locationSharing: "enabled",
    liveLocation: {
      lat: 39.2512,
      lng: 22.7512,
      label: "בקבלה",
      updatedMinutesAgo: 1
    }
  },
  {
    id: "noa",
    name: "נועה",
    role: "member",
    ageGroup: "child",
    locationSharing: "enabled",
    liveLocation: {
      lat: 39.2508,
      lng: 22.7517,
      label: "בחדר",
      updatedMinutesAgo: 4
    }
  },
  {
    id: "grandma",
    name: "סבתא",
    role: "viewer",
    ageGroup: "senior",
    locationSharing: "disabled",
    liveLocation: null
  }
];

export const demoMessages = [
  { author: "אבא", text: "בא לי גלידה." },
  { author: "נועה", text: "בא לי לישון." },
  {
    author: "אמא",
    text: "קודי, יש לך המלצה למשהו שיהיה קרוב למלון ואפשר לאכול שם גלידה?"
  },
  {
    author: "קודי",
    text:
      "שמעתי: אבא רוצה גלידה, נועה עייפה, ואמא מחפשת משהו קרוב למלון. הייתי מחפש מקום קל ליד Hotel Marathia, בלי סטייה גדולה ובלי הליכה ארוכה. אם תרצו, אסמן הצעה ואפתח ניווט."
  }
];
