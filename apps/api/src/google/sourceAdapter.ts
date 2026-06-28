import path from "node:path";
import type { TripPlace, TripPlacesSummary } from "../domain/types.js";
import {
  buildTripPlacesSummary,
  DEMO_GOOGLE_SOURCE_URL,
  DEMO_SOURCE_ID,
  getDemoTripPlacesSourcePath,
  loadDemoTripPlaces
} from "../data/localPlaces.js";

export type GoogleSourceAdapterKind = "fixture" | "google_api";
export type GoogleSourceState = "read_only_preview" | "not_configured" | "connected" | "needs_refresh";
export type GoogleSourceSyncMode = "read_only_fixture" | "google_api_read" | "google_oauth_live";

export interface GoogleSourcePreview {
  tripGroupId: string;
  adapter: {
    kind: GoogleSourceAdapterKind;
    name: string;
    liveGoogleAccess: boolean;
  };
  source: {
    id: string;
    type: "google_maps_place_list";
    state: GoogleSourceState;
    displayName: string;
    sourceUrl: string;
    fixtureFileName: string;
    importedPlacesCount: number;
    placesWithCoordinates: number;
    placesMissingCoordinates: number;
    placesWithGoogleIds: number;
    lastCheckedAt: string;
  };
  sync: {
    mode: GoogleSourceSyncMode;
    canPreviewImportedPlaces: boolean;
    canOpenGoogleMapsUrl: boolean;
    canWriteBackToGoogle: boolean;
    requiresGoogleOAuthForLiveSync: boolean;
    requiresGoogleMapsApiKeyForPlacesEnrichment: boolean;
    requiresRoutesApiForEta: boolean;
  };
  summary: TripPlacesSummary;
  previewPlaces: TripPlace[];
}

export interface GoogleSourceAdapter {
  readonly kind: GoogleSourceAdapterKind;
  buildPreview(): GoogleSourcePreview;
}

const DEMO_GROUP_ID = "group_family_greece_demo";

function countPlacesWithCoordinates(places: TripPlace[]) {
  return places.filter((place) => typeof place.lat === "number" && typeof place.lng === "number").length;
}

function buildReadOnlyFixturePreview(): GoogleSourcePreview {
  const sourcePath = getDemoTripPlacesSourcePath();
  const places = loadDemoTripPlaces();
  const placesWithCoordinates = countPlacesWithCoordinates(places);
  const placesWithGoogleIds = places.filter((place) => Boolean(place.sourcePlaceId)).length;

  return {
    tripGroupId: DEMO_GROUP_ID,
    adapter: {
      kind: "fixture",
      name: "Read-only Google fixture adapter",
      liveGoogleAccess: false
    },
    source: {
      id: DEMO_SOURCE_ID,
      type: "google_maps_place_list",
      state: "read_only_preview",
      displayName: "Google Maps Place List",
      sourceUrl: process.env.DEMO_GOOGLE_SOURCE_URL ?? DEMO_GOOGLE_SOURCE_URL,
      fixtureFileName: path.basename(sourcePath),
      importedPlacesCount: places.length,
      placesWithCoordinates,
      placesMissingCoordinates: places.length - placesWithCoordinates,
      placesWithGoogleIds,
      lastCheckedAt: new Date().toISOString()
    },
    sync: {
      mode: "read_only_fixture",
      canPreviewImportedPlaces: true,
      canOpenGoogleMapsUrl: true,
      canWriteBackToGoogle: false,
      requiresGoogleOAuthForLiveSync: true,
      requiresGoogleMapsApiKeyForPlacesEnrichment: true,
      requiresRoutesApiForEta: true
    },
    summary: buildTripPlacesSummary(places),
    previewPlaces: places.slice(0, 5)
  };
}

export const fixtureGoogleSourceAdapter: GoogleSourceAdapter = {
  kind: "fixture",
  buildPreview: buildReadOnlyFixturePreview
};

export function getActiveGoogleSourceAdapter(): GoogleSourceAdapter {
  return fixtureGoogleSourceAdapter;
}

export function buildDemoGoogleSourcePreview() {
  return getActiveGoogleSourceAdapter().buildPreview();
}
