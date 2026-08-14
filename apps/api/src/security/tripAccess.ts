import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const DEMO_TRIP_GROUP_ID = "group_family_greece_demo";
const INVITE_TTL_SECONDS = 60 * 60 * 24 * 7;

interface InvitePayload {
  v: 1;
  tripGroupId: typeof DEMO_TRIP_GROUP_ID;
  issuedByMemberId: string;
  expiresAt: number;
  nonce: string;
}

function getSigningSecret() {
  const configured =
    process.env.APP_AUTH_SECRET?.trim() ||
    process.env.MIGRATION_ADMIN_TOKEN?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_AUTH_SECRET is required in production");
  }
  return "kodi-local-development-only-secret";
}

function encode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(encodedPayload: string) {
  return createHmac("sha256", getSigningSecret()).update(encodedPayload).digest("base64url");
}

export function createTripInviteToken(issuedByMemberId: string, ttlSeconds = INVITE_TTL_SECONDS) {
  const payload: InvitePayload = {
    v: 1,
    tripGroupId: DEMO_TRIP_GROUP_ID,
    issuedByMemberId,
    expiresAt: Math.floor(Date.now() / 1000) + Math.max(300, Math.min(ttlSeconds, INVITE_TTL_SECONDS)),
    nonce: randomBytes(16).toString("base64url")
  };
  const encodedPayload = encode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function verifyTripInviteToken(token: unknown):
  | { ok: true; payload: InvitePayload }
  | { ok: false; reason: "missing" | "invalid" | "expired" } {
  if (typeof token !== "string" || !token.trim()) return { ok: false, reason: "missing" };
  const [encodedPayload, providedSignature, extra] = token.split(".");
  if (!encodedPayload || !providedSignature || extra) return { ok: false, reason: "invalid" };

  const expected = Buffer.from(sign(encodedPayload));
  const provided = Buffer.from(providedSignature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as InvitePayload;
    if (
      payload.v !== 1 ||
      payload.tripGroupId !== DEMO_TRIP_GROUP_ID ||
      typeof payload.issuedByMemberId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      typeof payload.nonce !== "string"
    ) {
      return { ok: false, reason: "invalid" };
    }
    if (payload.expiresAt <= Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };
    return { ok: true, payload };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}
