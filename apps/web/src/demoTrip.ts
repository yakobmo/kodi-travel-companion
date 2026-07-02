import googlePlacesRaw from "../../../data/demo-google-places.json";

type DemoPlaceType = "lodging" | "attraction" | "water" | "food" | "transport" | "stop" | "unknown";

interface DemoGooglePlace {
  id: string;
  sourceIndex?: number;
  name: string;
  type: DemoPlaceType;
  note?: string;
  address?: string;
  lat?: number;
  lng?: number;
}

const googlePlaces = googlePlacesRaw as DemoGooglePlace[];

export const demoTripSummary = {
  name: "צפון יוון",
  totalPlaces: googlePlaces.length,
  lodgingCount: googlePlaces.filter((place) => place.type === "lodging").length,
  waterCount: googlePlaces.filter((place) => place.type === "water").length,
  groupName: "קבוצת הטיול"
};

export const demoPlaces = googlePlaces.map((place) => ({
  ...place,
  tags: [place.type]
}));

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
