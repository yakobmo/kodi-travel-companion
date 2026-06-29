export type GooglePlacesSearchStatus = "not_configured" | "ready" | "google_error";

export interface GooglePlacesTextSearchInput {
  query: string;
  lat?: number;
  lng?: number;
  radiusMeters?: number;
  languageCode?: string;
  regionCode?: string;
}

export interface GooglePlacesTextSearchPlace {
  id?: string;
  displayName?: string;
  formattedAddress?: string;
  googleMapsUri?: string;
  lat?: number;
  lng?: number;
  types: string[];
}

export interface GooglePlacesTextSearchResult {
  provider: "google_places_text_search";
  status: GooglePlacesSearchStatus;
  configured: boolean;
  query: string;
  request: {
    hasLocationBias: boolean;
    radiusMeters: number;
    languageCode: string;
    regionCode?: string;
    fieldMask: string;
  };
  places: GooglePlacesTextSearchPlace[];
  error?: {
    code: string;
    message: string;
  };
  checkedAt: string;
}

interface GooglePlacesApiPlace {
  id?: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  googleMapsUri?: string;
  location?: {
    latitude?: number;
    longitude?: number;
  };
  types?: string[];
}

interface GooglePlacesApiResponse {
  places?: GooglePlacesApiPlace[];
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
}

const GOOGLE_PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const GOOGLE_PLACES_FIELD_MASK =
  "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.location,places.types";
const DEFAULT_RADIUS_METERS = 5000;

function getGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

function normalizeRadiusMeters(value: number | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return DEFAULT_RADIUS_METERS;
  }

  return Math.min(Math.max(Math.round(value), 100), 50000);
}

function buildTextSearchBody(input: GooglePlacesTextSearchInput, radiusMeters: number) {
  const body: Record<string, unknown> = {
    textQuery: input.query.trim(),
    languageCode: input.languageCode ?? "he"
  };

  if (input.regionCode) {
    body.regionCode = input.regionCode;
  }

  if (typeof input.lat === "number" && typeof input.lng === "number") {
    body.locationBias = {
      circle: {
        center: {
          latitude: input.lat,
          longitude: input.lng
        },
        radius: radiusMeters
      }
    };
  }

  return body;
}

function mapGooglePlace(place: GooglePlacesApiPlace): GooglePlacesTextSearchPlace {
  return {
    id: place.id,
    displayName: place.displayName?.text,
    formattedAddress: place.formattedAddress,
    googleMapsUri: place.googleMapsUri,
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    types: Array.isArray(place.types) ? place.types : []
  };
}

export async function searchGooglePlacesText(
  input: GooglePlacesTextSearchInput
): Promise<GooglePlacesTextSearchResult> {
  const query = input.query.trim();
  const apiKey = getGoogleMapsApiKey();
  const radiusMeters = normalizeRadiusMeters(input.radiusMeters);
  const hasLocationBias = typeof input.lat === "number" && typeof input.lng === "number";
  const base = {
    provider: "google_places_text_search" as const,
    query,
    request: {
      hasLocationBias,
      radiusMeters,
      languageCode: input.languageCode ?? "he",
      regionCode: input.regionCode,
      fieldMask: GOOGLE_PLACES_FIELD_MASK
    },
    places: [],
    checkedAt: new Date().toISOString()
  };

  if (!apiKey) {
    return {
      ...base,
      status: "not_configured",
      configured: false,
      error: {
        code: "google_maps_api_key_required",
        message: "GOOGLE_MAPS_API_KEY is required before Kodi can call Google Places Text Search."
      }
    };
  }

  const response = await fetch(GOOGLE_PLACES_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": GOOGLE_PLACES_FIELD_MASK
    },
    body: JSON.stringify(buildTextSearchBody(input, radiusMeters))
  });
  const payload = (await response.json()) as GooglePlacesApiResponse;

  if (!response.ok) {
    return {
      ...base,
      status: "google_error",
      configured: true,
      error: {
        code: payload.error?.status ?? `google_http_${response.status}`,
        message: payload.error?.message ?? "Google Places Text Search request failed."
      }
    };
  }

  return {
    ...base,
    status: "ready",
    configured: true,
    places: (payload.places ?? []).slice(0, 10).map(mapGooglePlace)
  };
}
