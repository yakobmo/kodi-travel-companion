export type GoogleRouteEstimateStatus = "not_configured" | "ready" | "google_error";
export type GoogleRouteTravelMode = "DRIVE" | "WALK" | "BICYCLE" | "TWO_WHEELER";

export interface GoogleRouteCoordinate {
  lat: number;
  lng: number;
}

export interface GoogleRouteEstimateInput {
  origin: GoogleRouteCoordinate;
  destination: GoogleRouteCoordinate;
  travelMode?: GoogleRouteTravelMode;
  languageCode?: string;
}

export interface GoogleRouteEstimateResult {
  provider: "google_routes_compute_routes";
  status: GoogleRouteEstimateStatus;
  configured: boolean;
  request: {
    travelMode: GoogleRouteTravelMode;
    languageCode: string;
    fieldMask: string;
  };
  route?: {
    durationSeconds: number;
    durationText: string;
    distanceMeters: number;
    distanceText: string;
  };
  error?: {
    code: string;
    message: string;
  };
  checkedAt: string;
}

interface GoogleRoutesApiResponse {
  routes?: Array<{
    duration?: string;
    distanceMeters?: number;
  }>;
  error?: {
    code?: number;
    status?: string;
    message?: string;
  };
}

const GOOGLE_ROUTES_COMPUTE_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const GOOGLE_ROUTES_FIELD_MASK = "routes.duration,routes.distanceMeters";
const DEFAULT_TIMEOUT_MS = 3500;

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

function normalizeTravelMode(value: GoogleRouteTravelMode | undefined): GoogleRouteTravelMode {
  return value ?? "DRIVE";
}

function parseGoogleDurationSeconds(duration: string | undefined) {
  if (!duration) {
    return 0;
  }

  const match = duration.match(/^(\d+)s$/);
  return match ? Number(match[1]) : 0;
}

function formatDuration(seconds: number) {
  if (seconds <= 0) {
    return "לא זמין";
  }

  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) {
    return `${minutes} דקות`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} שעות ו-${remainingMinutes} דקות` : `${hours} שעות`;
}

function formatDistance(meters: number) {
  if (!Number.isFinite(meters) || meters <= 0) {
    return "לא זמין";
  }

  if (meters < 1000) {
    return `${Math.round(meters)} מטר`;
  }

  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} ק״מ`;
}

function buildLatLng(coordinate: GoogleRouteCoordinate) {
  return {
    location: {
      latLng: {
        latitude: coordinate.lat,
        longitude: coordinate.lng
      }
    }
  };
}

function buildRouteRequestBody(input: GoogleRouteEstimateInput, travelMode: GoogleRouteTravelMode) {
  return {
    origin: buildLatLng(input.origin),
    destination: buildLatLng(input.destination),
    travelMode,
    languageCode: input.languageCode ?? "he",
    units: "METRIC"
  };
}

export async function estimateGoogleRoute(input: GoogleRouteEstimateInput): Promise<GoogleRouteEstimateResult> {
  const apiKey = getGoogleMapsApiKey();
  const travelMode = normalizeTravelMode(input.travelMode);
  const languageCode = input.languageCode ?? "he";
  const base = {
    provider: "google_routes_compute_routes" as const,
    request: {
      travelMode,
      languageCode,
      fieldMask: GOOGLE_ROUTES_FIELD_MASK
    },
    checkedAt: new Date().toISOString()
  };

  if (!apiKey) {
    return {
      ...base,
      status: "not_configured",
      configured: false,
      error: {
        code: "google_maps_api_key_required",
        message: "GOOGLE_MAPS_API_KEY is required before Kodi can call Google Routes."
      }
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), normalizeTimeoutMs(process.env.GOOGLE_ROUTES_TIMEOUT_MS));
  let response: Response;

  try {
    response = await fetch(GOOGLE_ROUTES_COMPUTE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": GOOGLE_ROUTES_FIELD_MASK
      },
      body: JSON.stringify(buildRouteRequestBody(input, travelMode)),
      signal: controller.signal
    });
  } catch (error) {
    return {
      ...base,
      status: "google_error",
      configured: true,
      error: {
        code: error instanceof Error && error.name === "AbortError" ? "google_routes_timeout" : "google_routes_fetch_error",
        message:
          error instanceof Error && error.name === "AbortError"
            ? "Google Routes timed out before Kodi could use it."
            : "Google Routes request failed before a response was returned."
      }
    };
  } finally {
    clearTimeout(timeout);
  }

  const payload = (await response.json()) as GoogleRoutesApiResponse;

  if (!response.ok) {
    return {
      ...base,
      status: "google_error",
      configured: true,
      error: {
        code: payload.error?.status ?? `google_http_${response.status}`,
        message: payload.error?.message ?? "Google Routes request failed."
      }
    };
  }

  const firstRoute = payload.routes?.[0];
  const durationSeconds = parseGoogleDurationSeconds(firstRoute?.duration);
  const distanceMeters = firstRoute?.distanceMeters ?? 0;

  return {
    ...base,
    status: "ready",
    configured: true,
    route: {
      durationSeconds,
      durationText: formatDuration(durationSeconds),
      distanceMeters,
      distanceText: formatDistance(distanceMeters)
    }
  };
}
