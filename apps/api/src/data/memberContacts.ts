import { createSupabaseServerClient } from "./supabaseClient.js";
import { DEMO_TRIP_GROUP_UUID, demoMemberUuidById } from "./demoRelationalIds.js";

function toUuid(memberId: string) {
  return demoMemberUuidById[memberId] ?? memberId;
}

function toAppMemberId(uuid: string) {
  return Object.entries(demoMemberUuidById).find(([, value]) => value === uuid)?.[0] ?? uuid;
}

export function normalizePhoneE164(value: unknown) {
  if (typeof value !== "string") return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export async function linkMemberWhatsAppContact(input: { memberId: string; phone: unknown; verified?: boolean }) {
  const phoneE164 = normalizePhoneE164(input.phone);
  if (!phoneE164) return { linked: false as const, reason: "invalid_phone" };
  const supabase = createSupabaseServerClient();
  if (!supabase) return { linked: false as const, reason: "storage_not_configured" };
  const now = new Date().toISOString();
  const { error } = await supabase.from("trip_member_contacts").upsert({
    member_id: toUuid(input.memberId),
    trip_group_id: DEMO_TRIP_GROUP_UUID,
    phone_e164: phoneE164,
    whatsapp_wa_id: phoneE164,
    phone_verified_at: input.verified ? now : null,
    updated_at: now
  });
  if (error) throw new Error(`Member contact link failed: ${error.message}`);
  return { linked: true as const, phoneMasked: `****${phoneE164.slice(-4)}` };
}

export async function findMemberIdByWhatsAppId(rawWhatsAppId: string) {
  const phoneE164 = normalizePhoneE164(rawWhatsAppId);
  const supabase = createSupabaseServerClient();
  if (!supabase || !phoneE164) return null;
  const { data, error } = await supabase
    .from("trip_member_contacts")
    .select("member_id")
    .eq("trip_group_id", DEMO_TRIP_GROUP_UUID)
    .or(`whatsapp_wa_id.eq.${phoneE164},phone_e164.eq.${phoneE164}`)
    .maybeSingle();
  if (error) throw new Error(`Member contact lookup failed: ${error.message}`);
  return data?.member_id ? toAppMemberId(String(data.member_id)) : null;
}

export async function claimWhatsAppMessage(providerMessageId: string, senderWhatsAppId: string) {
  const supabase = createSupabaseServerClient();
  if (!supabase) return true;
  const { error } = await supabase.from("whatsapp_message_receipts").insert({
    provider_message_id: providerMessageId,
    trip_group_id: DEMO_TRIP_GROUP_UUID,
    sender_wa_id: normalizePhoneE164(senderWhatsAppId) || senderWhatsAppId
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw new Error(`WhatsApp receipt insert failed: ${error.message}`);
}
