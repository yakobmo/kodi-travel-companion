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
  readableAddress?: string;
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
  address_components?: Array<{
    long_name?: string;
    short_name?: string;
    types?: string[];
  }>;
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
const DEFAULT_TIMEOUT_MS = 2500;

function getGoogleMapsApiKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() ?? "";
}

function normalizeTimeoutMs(value: string | undefined) {
  const timeoutMs = Number(value);

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return DEFAULT_TIMEOUT_MS;
  }

  return Math.min(Math.max(Math.round(timeoutMs), 800), 8000);
}

function isFiniteCoordinate(value: number) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasAnyType(result: GoogleGeocodeResult | undefined, types: string[]) {
  return Boolean(result?.types?.some((type) => types.includes(type)));
}

function scoreGeocodeResult(result: GoogleGeocodeResult) {
  let score = 0;

  if (result.formatted_address) {
    score += 1;
  }

  if (hasAnyType(result, ["street_address", "premise", "point_of_interest", "establishment", "school"])) {
    score += 10;
  }

  if (hasAnyType(result, ["route", "neighborhood", "locality"])) {
    score += 5;
  }

  if (hasAnyType(result, ["plus_code"])) {
    score -= 5;
  }

  if (result.geometry?.location_type === "ROOFTOP") {
    score += 3;
  }

  if (result.geometry?.location_type === "RANGE_INTERPOLATED") {
    score += 2;
  }

  return score;
}

function selectBestGeocodeResult(results: GoogleGeocodeResult[] = []) {
  return [...results].sort((first, second) => scoreGeocodeResult(second) - scoreGeocodeResult(first))[0];
}

function buildReadableAddress(result: GoogleGeocodeResult | undefined) {
  if (!result?.formatted_address) {
    return undefined;
  }

  const components = result.address_components ?? [];
  const getComponent = (types: string[]) =>
    components.find((component) => component.types?.some((type) => types.includes(type)))?.long_name;
  const streetNumber = getComponent(["street_number"]);
  const route = getComponent(["route"]);
  const premise = getComponent(["premise", "point_of_interest", "establishment", "school"]);
  const locality = getComponent(["locality", "postal_town", "administrative_area_level_2"]);

  const street = [route, streetNumber].filter(Boolean).join(" ");
  return [premise, street, locality].filter(Boolean).join(", ") || result.formatted_address;
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

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizeTimeoutMs(process.env.GOOGLE_GEOCODE_TIMEOUT_MS));
  let response: Response;

  try {
    response = await fetch(`${GOOGLE_GEOCODE_URL}?${params.toString()}`, {
      signal: controller.signal
    });
  } catch (error) {
    return {
      ...base,
      configured: true,
      status: "google_error",
      error: {
        code: error instanceof Error && error.name === "AbortError" ? "google_geocode_timeout" : "google_geocode_fetch_error",
        message:
          error instanceof Error && error.name === "AbortError"
            ? "Google reverse geocoding timed out before Kodi could use it."
            : "Google reverse geocoding request failed before a response was returned."
      }
    };
  } finally {
    clearTimeout(timeout);
  }

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

  const best = selectBestGeocodeResult(payload.results);

  return {
    ...base,
    configured: true,
    status: "ready",
    formattedAddress: best?.formatted_address,
    readableAddress: buildReadableAddress(best),
    placeId: best?.place_id,
    locationTypes: best?.geometry?.location_type ? [best.geometry.location_type] : [],
    resultTypes: Array.isArray(best?.types) ? best.types : []
  };
}
