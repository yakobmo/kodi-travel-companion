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
    id: "mom",
    name: "מנהל הטיול",
    role: "owner",
    ageGroup: "adult",
    locationSharing: "enabled",
    liveLocation: {
      lat: 39.2512,
      lng: 22.7512,
      label: "בקבלה",
      updatedMinutesAgo: 1
    }
  }
];

export const demoMessages: { author: string; text: string }[] = [];
