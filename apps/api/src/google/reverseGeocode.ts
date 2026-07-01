export type GoogleReverseGeocodeStatus = "not_configured" | "ready" | "google_error";

export interface GoogleReverseGeocodeInput {
  lat: number;
  lng: number;
  languageCode?: string;
  regionCode?: string;
}

export interface GoogleReverseGeocodeResult {
  provider: "google_reverse_geocode";
  status: GoogleReverseGeocodeStatus;
  configured: boolean;
  lat: number;
  lng: number;
  formattedAddress?: string;
  placeId?: string;
  locationTypes: string[];
  resultTypes: string[];
  checkedAt: string;
  error?: {
    code: string;
    message: string;
  };
}

interface GoogleGeocodeResult {
  formatted_address?: string;
  place_id?: string;
  types?: string[];
  geometry?: {
    location_type?: string;
  };
}

interface GoogleGeocodeResponse {
  results?: GoogleGeocodeResult[];
  status?: string;
  error_message?: string;
}

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";

function getGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

function isFiniteCoordinate(value: number) {
  return typeof value === "number" && Number.isFinite(value);
}

export async function reverseGeocodeLocation(input: GoogleReverseGeocodeInput): Promise<GoogleReverseGeocodeResult> {
  const base = {
    provider: "google_reverse_geocode" as const,
    configured: false,
    lat: input.lat,
    lng: input.lng,
    locationTypes: [],
    resultTypes: [],
    checkedAt: new Date().toISOString()
  };

  if (!isFiniteCoordinate(input.lat) || !isFiniteCoordinate(input.lng)) {
    return {
      ...base,
      status: "google_error",
      error: {
        code: "invalid_coordinates",
        message: "Reverse geocoding requires finite latitude and longitude."
      }
    };
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return {
      ...base,
      status: "not_configured",
      error: {
        code: "google_maps_api_key_required",
        message: "GOOGLE_MAPS_API_KEY is required before Kodi can reverse geocode live GPS coordinates."
      }
    };
  }

  const params = new URLSearchParams({
    latlng: `${input.lat},${input.lng}`,
    language: input.languageCode ?? "he",
    key: apiKey
  });

  if (input.regionCode) {
    params.set("region", input.regionCode);
  }

  const response = await fetch(`${GOOGLE_GEOCODE_URL}?${params.toString()}`);
  const payload = (await response.json()) as GoogleGeocodeResponse;

  if (!response.ok || payload.status !== "OK") {
    return {
      ...base,
      configured: true,
      status: "google_error",
      error: {
        code: payload.status ?? `google_http_${response.status}`,
        message: payload.error_message ?? "Google Geocoding reverse lookup failed."
      }
    };
  }

  const best = payload.results?.[0];

  return {
    ...base,
    configured: true,
    status: "ready",
    formattedAddress: best?.formatted_address,
    placeId: best?.place_id,
    locationTypes: best?.geometry?.location_type ? [best.geometry.location_type] : [],
    resultTypes: Array.isArray(best?.types) ? best.types : []
  };
}
