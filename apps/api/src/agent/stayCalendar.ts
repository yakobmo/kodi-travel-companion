import type { TripPlace, TripState } from "../domain/types.js";

export interface StayDate {
  month: number;
  day: number;
}

export interface TripStayBooking {
  lodging: Pick<TripPlace, "id" | "name" | "address" | "lat" | "lng" | "note" | "sourceIndex">;
  checkIn?: string;
  checkOut?: string;
  nights: number;
  dateSource: "lodging_note" | "map_order_only";
}

export interface TripStayNight {
  night: number;
  date: string;
  lodging: TripStayBooking["lodging"];
}

const monthNames = new Map<string, number>([
  ["ינואר", 1], ["january", 1], ["jan", 1],
  ["פברואר", 2], ["february", 2], ["feb", 2],
  ["מרץ", 3], ["march", 3], ["mar", 3],
  ["אפריל", 4], ["april", 4], ["apr", 4],
  ["מאי", 5], ["may", 5],
  ["יוני", 6], ["june", 6], ["jun", 6],
  ["יולי", 7], ["july", 7], ["jul", 7],
  ["אוגוסט", 8], ["august", 8], ["aug", 8],
  ["ספטמבר", 9], ["september", 9], ["sep", 9],
  ["אוקטובר", 10], ["october", 10], ["oct", 10],
  ["נובמבר", 11], ["november", 11], ["nov", 11],
  ["דצמבר", 12], ["december", 12], ["dec", 12]
]);

const monthPattern = Array.from(monthNames.keys()).join("|");

function validDate(day: number, month: number): StayDate | undefined {
  if (day < 1 || day > 31 || month < 1 || month > 12) return undefined;
  return { day, month };
}

function parseMonth(value: string) {
  return monthNames.get(value.toLocaleLowerCase()) ?? 0;
}

export function parseStayDateRange(note: string | undefined) {
  const text = (note ?? "").toLocaleLowerCase().replace(/[–—]/g, "-");
  if (!text.trim()) return undefined;

  // A named month makes 2-3 בספטמבר a day range, never the numeric date 2 March.
  const namedShorthand = text.match(new RegExp(`(\\d{1,2})\\s*-\\s*(\\d{1,2})\\s*(?:ב|ל)?(${monthPattern})`, "iu"));
  if (namedShorthand) {
    const month = parseMonth(namedShorthand[3]);
    const start = validDate(Number(namedShorthand[1]), month);
    const end = validDate(Number(namedShorthand[2]), month);
    if (start && end) return { start, end };
  }

  const mentions: StayDate[] = [];
  const datePattern = new RegExp(`(\\d{1,2})\\s*(?:[./]\\s*(\\d{1,2})|(?:ב|ל)?(${monthPattern}))`, "giu");
  for (const match of text.matchAll(datePattern)) {
    const day = Number(match[1]);
    const month = match[2] ? Number(match[2]) : parseMonth(match[3] ?? "");
    const date = validDate(day, month);
    if (date) mentions.push(date);
  }

  if (mentions.length === 0) return undefined;
  return { start: mentions[0], end: mentions[1] };
}

function ordinal(date: StayDate) {
  return Date.UTC(2024, date.month - 1, date.day) / 86_400_000;
}

function formatDate(ordinalDay: number) {
  const date = new Date(ordinalDay * 86_400_000);
  return `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function buildTripStayCalendar(tripState: TripState) {
  const bookings = tripState.places
    .filter((place) => place.type === "lodging")
    .map((place) => ({ place, range: parseStayDateRange(place.note) }))
    .sort((first, second) => {
      const firstDate = first.range ? ordinal(first.range.start) : Number.MAX_SAFE_INTEGER;
      const secondDate = second.range ? ordinal(second.range.start) : Number.MAX_SAFE_INTEGER;
      return firstDate - secondDate || (first.place.sourceIndex ?? Number.MAX_SAFE_INTEGER) - (second.place.sourceIndex ?? Number.MAX_SAFE_INTEGER);
    });

  const stays: TripStayBooking[] = [];
  const nights: TripStayNight[] = [];

  for (const { place, range } of bookings) {
    const lodging = {
      id: place.id,
      name: place.name,
      address: place.address,
      lat: place.lat,
      lng: place.lng,
      note: place.note,
      sourceIndex: place.sourceIndex
    };
    if (!range) {
      stays.push({ lodging, nights: 0, dateSource: "map_order_only" });
      continue;
    }

    const start = ordinal(range.start);
    let end = range.end ? ordinal(range.end) : start + 1;
    if (end <= start) end = ordinal({ month: range.end?.month ?? range.start.month, day: range.end?.day ?? range.start.day }) + 366;
    const nightCount = Math.min(Math.max(end - start, 1), 60);
    stays.push({
      lodging,
      checkIn: formatDate(start),
      checkOut: formatDate(start + nightCount),
      nights: nightCount,
      dateSource: "lodging_note"
    });
    for (let offset = 0; offset < nightCount; offset += 1) {
      nights.push({ night: nights.length + 1, date: formatDate(start + offset), lodging });
    }
  }

  return { stays, nights };
}
