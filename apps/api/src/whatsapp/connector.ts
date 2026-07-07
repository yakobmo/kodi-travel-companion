export interface WhatsAppConnectorReadiness {
  provider: "whatsapp_cloud_api";
  enabled: boolean;
  ready: boolean;
  readyScope: "disabled" | "missing_config" | "configuration_only";
  liveReady: false;
  mode: "dry_run" | "webhook_ready";
  status: "disabled" | "missing_config" | "configured_not_verified";
  missing: string[];
  blockers: string[];
  warnings: string[];
  webhookPath: "/api/whatsapp/webhook";
  readinessPath: "/api/whatsapp/readiness";
}

export interface WhatsAppIncomingTextMessage {
  provider: "whatsapp";
  messageId: string;
  from: string;
  fromMasked: string;
  profileName?: string;
  phoneNumberId?: string;
  timestamp?: string;
  text: string;
  rawType: string;
}

export interface WhatsAppKodiRoutingPlan {
  tripGroupId: "group_family_greece_demo";
  source: "whatsapp";
  dryRun: true;
  requiresLinkedMember: true;
  externalUserIdMasked: string;
  text: string;
  nextStep: "link_whatsapp_contact_to_trip_member";
}

export interface WhatsAppSendResult {
  status: "sent" | "not_configured" | "failed";
  recipientMasked: string;
  providerMessageId?: string;
  error?: string;
}

interface WhatsAppWebhookQuery {
  "hub.mode"?: unknown;
  "hub.verify_token"?: unknown;
  "hub.challenge"?: unknown;
}

interface WhatsAppWebhookVerificationResult {
  ok: boolean;
  status: number;
  challenge?: string;
  reason?: "not_configured" | "invalid_mode" | "invalid_token" | "missing_challenge";
}

function getEnvValue(name: string) {
  return process.env[name]?.trim() ?? "";
}

function requiredConfig() {
  return {
    WHATSAPP_VERIFY_TOKEN: getEnvValue("WHATSAPP_VERIFY_TOKEN"),
    WHATSAPP_ACCESS_TOKEN: getEnvValue("WHATSAPP_ACCESS_TOKEN"),
    WHATSAPP_PHONE_NUMBER_ID: getEnvValue("WHATSAPP_PHONE_NUMBER_ID"),
    WHATSAPP_BUSINESS_ACCOUNT_ID: getEnvValue("WHATSAPP_BUSINESS_ACCOUNT_ID"),
    APP_BASE_URL: getEnvValue("APP_BASE_URL")
  };
}

function getWhatsAppApiVersion() {
  return getEnvValue("WHATSAPP_GRAPH_API_VERSION") || "v20.0";
}

function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0];
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

export function maskWhatsAppId(value: string) {
  const normalized = value.replace(/\D/g, "");
  if (normalized.length <= 4) {
    return "****";
  }

  return `${"*".repeat(Math.max(normalized.length - 4, 4))}${normalized.slice(-4)}`;
}

export function getWhatsAppConnectorReadiness(): WhatsAppConnectorReadiness {
  const enabled = getEnvValue("WHATSAPP_CONNECTOR_ENABLED") === "true";
  const config = requiredConfig();
  const missing = Object.entries(config)
    .filter(([, value]) => value.length === 0)
    .map(([key]) => key);
  const ready = enabled && missing.length === 0;

  return {
    provider: "whatsapp_cloud_api",
    enabled,
    ready,
    readyScope: ready ? "configuration_only" : enabled ? "missing_config" : "disabled",
    liveReady: false,
    mode: ready ? "webhook_ready" : "dry_run",
    status: !enabled ? "disabled" : missing.length > 0 ? "missing_config" : "configured_not_verified",
    missing,
    blockers: !enabled
      ? ["connector_disabled"]
      : missing.map((key) => `missing_${key.toLowerCase()}`),
    warnings: ready
      ? [
          "Configuration exists, but live WhatsApp operation also requires a valid Meta Graph token and a production-capable Meta app."
        ]
      : [],
    webhookPath: "/api/whatsapp/webhook",
    readinessPath: "/api/whatsapp/readiness"
  };
}

export function verifyWhatsAppWebhook(
  query: WhatsAppWebhookQuery,
  expectedVerifyToken = getEnvValue("WHATSAPP_VERIFY_TOKEN")
): WhatsAppWebhookVerificationResult {
  if (!expectedVerifyToken) {
    return { ok: false, status: 501, reason: "not_configured" };
  }

  const mode = asString(query["hub.mode"]);
  const token = asString(query["hub.verify_token"]);
  const challenge = asString(query["hub.challenge"]);

  if (mode !== "subscribe") {
    return { ok: false, status: 400, reason: "invalid_mode" };
  }

  if (token !== expectedVerifyToken) {
    return { ok: false, status: 403, reason: "invalid_token" };
  }

  if (!challenge) {
    return { ok: false, status: 400, reason: "missing_challenge" };
  }

  return { ok: true, status: 200, challenge };
}

export function parseWhatsAppWebhookPayload(payload: unknown): WhatsAppIncomingTextMessage[] {
  const messages: WhatsAppIncomingTextMessage[] = [];

  for (const entry of asRecordArray(isRecord(payload) ? payload.entry : undefined)) {
    for (const change of asRecordArray(entry.changes)) {
      const value = isRecord(change.value) ? change.value : undefined;
      if (!value) {
        continue;
      }

      const metadata = isRecord(value.metadata) ? value.metadata : undefined;
      const phoneNumberId = asString(metadata?.phone_number_id) || undefined;
      const contactsByWaId = new Map<string, string>();

      for (const contact of asRecordArray(value.contacts)) {
        const waId = asString(contact.wa_id);
        const profile = isRecord(contact.profile) ? contact.profile : undefined;
        const name = asString(profile?.name);
        if (waId && name) {
          contactsByWaId.set(waId, name);
        }
      }

      for (const rawMessage of asRecordArray(value.messages)) {
        const rawType = asString(rawMessage.type) || "unknown";
        const textRecord = isRecord(rawMessage.text) ? rawMessage.text : undefined;
        const text = rawType === "text" ? asString(textRecord?.body).trim() : "";

        if (!text) {
          continue;
        }

        const from = asString(rawMessage.from);
        messages.push({
          provider: "whatsapp",
          messageId: asString(rawMessage.id) || `wa_${Date.now()}_${messages.length}`,
          from,
          fromMasked: maskWhatsAppId(from),
          profileName: contactsByWaId.get(from),
          phoneNumberId,
          timestamp: asString(rawMessage.timestamp) || undefined,
          text,
          rawType
        });
      }
    }
  }

  return messages;
}

export function buildWhatsAppKodiRoutingPlan(message: WhatsAppIncomingTextMessage): WhatsAppKodiRoutingPlan {
  return {
    tripGroupId: "group_family_greece_demo",
    source: "whatsapp",
    dryRun: true,
    requiresLinkedMember: true,
    externalUserIdMasked: message.fromMasked,
    text: message.text,
    nextStep: "link_whatsapp_contact_to_trip_member"
  };
}

export async function sendWhatsAppTextMessage(input: {
  to: string;
  text: string;
  timeoutMs?: number;
}): Promise<WhatsAppSendResult> {
  const readiness = getWhatsAppConnectorReadiness();
  const config = requiredConfig();
  const recipientMasked = maskWhatsAppId(input.to);

  if (!readiness.ready) {
    return {
      status: "not_configured",
      recipientMasked
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), input.timeoutMs ?? 8000);

  try {
    const response = await fetch(
      `https://graph.facebook.com/${getWhatsAppApiVersion()}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: input.to,
          type: "text",
          text: {
            preview_url: true,
            body: input.text.slice(0, 3900)
          }
        }),
        signal: controller.signal
      }
    );

    const payload = (await response.json().catch(() => undefined)) as
      | { messages?: Array<{ id?: string }>; error?: { message?: string } }
      | undefined;

    if (!response.ok) {
      return {
        status: "failed",
        recipientMasked,
        error: payload?.error?.message ?? `Meta WhatsApp API returned HTTP ${response.status}`
      };
    }

    return {
      status: "sent",
      recipientMasked,
      providerMessageId: payload?.messages?.[0]?.id
    };
  } catch (error) {
    return {
      status: "failed",
      recipientMasked,
      error: error instanceof Error ? error.message : "Unknown WhatsApp send error"
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
