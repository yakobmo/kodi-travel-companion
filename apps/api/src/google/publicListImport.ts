import type { SourcePlace } from "../data/localPlaces.js";

const GOOGLE_LIST_HREF_PATTERN = /href="(\/maps\/preview\/entitylist\/getlist[^"]+)"/;
const GOOGLE_RESPONSE_PREFIX = /^\)\]\}'\n/;

export interface GooglePublicListImportResult {
  sourceUrl: string;
  resolvedUrl: string;
  listName: string;
  declaredCount: number;
  importedAt: string;
  places: SourcePlace[];
}

function normalizeGoogleHref(value: string) {
  return value.replaceAll("&amp;", "&");
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function inferPlaceType(input: { name: string; note: string; address: string }): SourcePlace["type"] {
  const text = `${input.name} ${input.note} ${input.address}`.toLowerCase();

  if (
    text.includes("hotel") ||
    text.includes("guesthouse") ||
    text.includes("studios") ||
    text.includes("villa") ||
    text.includes("booking") ||
    text.includes("לינה") ||
    text.includes("מלון") ||
    text.includes("וילה")
  ) {
    return "lodging";
  }

  if (
    text.includes("beach") ||
    text.includes("river") ||
    text.includes("springs") ||
    text.includes("waterfall") ||
    text.includes("pools") ||
    text.includes("boats") ||
    text.includes("boat") ||
    text.includes("חוף") ||
    text.includes("מים") ||
    text.includes("סירה")
  ) {
    return "water";
  }

  if (text.includes("bridge") || text.includes("airport") || text.includes("שדה")) {
    return "transport";
  }

  return "attraction";
}

function parseGoogleListResponse(text: string, sourceUrl: string, resolvedUrl: string): GooglePublicListImportResult {
  const payload = JSON.parse(text.replace(GOOGLE_RESPONSE_PREFIX, "")) as unknown;

  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    throw new Error("Google public list response shape is not recognized.");
  }

  const root = payload[0] as unknown[];
  const listName = asString(root[4]) || "Google Maps list";
  const declaredCount = asNumber(root[12]) ?? 0;
  const rawItems = Array.isArray(root[8]) ? (root[8] as unknown[]) : [];

  const places = rawItems
    .map((rawItem, index): SourcePlace | null => {
      if (!Array.isArray(rawItem)) {
        return null;
      }

      const item = rawItem as unknown[];
      const details = Array.isArray(item[1]) ? (item[1] as unknown[]) : [];
      const coords = Array.isArray(details[5]) ? (details[5] as unknown[]) : [];
      const googleIds = Array.isArray(details[6])
        ? (details[6] as unknown[]).map((value) => String(value)).filter(Boolean)
        : undefined;
      const name = asString(item[2]);
      const note = asString(item[3]);
      const address = asString(details[4]);
      const lat = asNumber(coords[2]);
      const lng = asNumber(coords[3]);

      if (!name) {
        return null;
      }

      const id = googleIds?.length ? googleIds.join(":") : `google_public_${index + 1}`;

      return {
        id,
        sourceIndex: index + 1,
        name,
        note: note || undefined,
        address: address || undefined,
        lat,
        lng,
        googleIds,
        type: inferPlaceType({ name, note, address })
      };
    })
    .filter((place): place is SourcePlace => Boolean(place));

  if (declaredCount > 0 && places.length !== declaredCount) {
    throw new Error(`Google public list declared ${declaredCount} places, but parser imported ${places.length}.`);
  }

  return {
    sourceUrl,
    resolvedUrl,
    listName,
    declaredCount: declaredCount || places.length,
    importedAt: new Date().toISOString(),
    places
  };
}

export async function importGooglePublicList(sourceUrl: string): Promise<GooglePublicListImportResult> {
  const headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    "accept-language": "he-IL,he;q=0.9,en;q=0.8"
  };

  const pageResponse = await fetch(sourceUrl, { redirect: "follow", headers });

  if (!pageResponse.ok) {
    throw new Error(`Google Maps public page returned HTTP ${pageResponse.status}.`);
  }

  const html = await pageResponse.text();
  const href = GOOGLE_LIST_HREF_PATTERN.exec(html)?.[1];

  if (!href) {
    throw new Error("Google Maps public page did not expose a list endpoint.");
  }

  const listUrl = `https://www.google.com${normalizeGoogleHref(href)}`;
  const listResponse = await fetch(listUrl, { headers });

  if (!listResponse.ok) {
    throw new Error(`Google Maps list endpoint returned HTTP ${listResponse.status}.`);
  }

  const text = await listResponse.text();
  return parseGoogleListResponse(text, sourceUrl, pageResponse.url);
}
