#!/usr/bin/env node

const baseUrl = (process.argv[2] || process.env.KODI_PUBLIC_URL || "https://kodi-travel-companion.onrender.com").replace(/\/$/, "");
const messageId = `wamid.kodi-smoke-${Date.now()}`;

async function fetchJson(path, init) {
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    ...(init?.headers || {})
  };
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers
  });
  const payload = await response.json().catch(() => undefined);
  return { response, payload };
}

const webhookPayload = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "kodi-smoke-waba",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "15556418912",
              phone_number_id: "1233453659846634"
            },
            contacts: [
              {
                profile: { name: "Kodi Smoke" },
                wa_id: "972500000000"
              }
            ],
            messages: [
              {
                from: "972500000000",
                id: messageId,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: "text",
                text: { body: "Kodi webhook dry-run smoke" }
              }
            ]
          }
        }
      ]
    }
  ]
};

const post = await fetchJson("/api/whatsapp/webhook?dryRun=1", {
  method: "POST",
  headers: {
    "x-kodi-webhook-dry-run": "true"
  },
  body: JSON.stringify(webhookPayload)
});

if (!post.response.ok || !post.payload?.ok || post.payload?.parsedMessages !== 1) {
  console.error(`WhatsApp webhook dry-run failed: HTTP ${post.response.status}`);
  console.error(JSON.stringify(post.payload, null, 2));
  process.exit(1);
}

const diagnostics = await fetchJson("/api/whatsapp/diagnostics");
if (!diagnostics.response.ok || !diagnostics.payload) {
  console.error(`WhatsApp diagnostics failed: HTTP ${diagnostics.response.status}`);
  process.exit(1);
}

const processing = Array.isArray(diagnostics.payload.recentProcessing)
  ? diagnostics.payload.recentProcessing
  : [];
const dryRunEntry = processing.find((entry) => entry.providerMessageId === messageId && entry.status === "dry_run");

console.log(`WhatsApp webhook dry-run smoke for ${baseUrl}`);
console.log(`- POST accepted: ${String(Boolean(post.payload.accepted))}`);
console.log(`- parsed messages: ${post.payload.parsedMessages}`);
console.log(`- processing mode: ${post.payload.processing}`);
console.log(`- diagnostics dry-run entry: ${String(Boolean(dryRunEntry))}`);
console.log(`- diagnostics live-ready: ${String(Boolean(diagnostics.payload.live?.liveReady))}`);

if (!dryRunEntry) {
  console.error("Diagnostics did not record the dry-run processing entry.");
  process.exit(1);
}

if (post.payload.processing !== "dry_run_not_queued") {
  console.error("Webhook smoke must not enqueue chat writes.");
  process.exit(1);
}
