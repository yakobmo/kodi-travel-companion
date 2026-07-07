#!/usr/bin/env node

const baseUrl = (process.argv[2] || process.env.KODI_PUBLIC_URL || "https://kodi-travel-companion.onrender.com").replace(/\/$/, "");
const requireLive = process.argv.includes("--require-live");

async function fetchJson(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      accept: "application/json"
    }
  });
  const payload = await response.json().catch(() => undefined);
  return { response, payload };
}

function asList(value) {
  return Array.isArray(value) ? value : [];
}

const readiness = await fetchJson("/api/whatsapp/readiness");
if (!readiness.response.ok || !readiness.payload) {
  console.error(`WhatsApp readiness endpoint failed: HTTP ${readiness.response.status}`);
  process.exitCode = 1;
} else {
  const live = readiness.payload.live || {};
  console.log(`WhatsApp readiness for ${baseUrl}`);
  console.log(`- connector status: ${readiness.payload.status || "unknown"}`);
  console.log(`- live stage: ${live.stage || "unknown"}`);
  console.log(`- token status: ${live.accessTokenStatus || "unknown"}`);
  console.log(`- phone numbers reachable: ${String(Boolean(live.phoneNumbersReachable))}`);
  console.log(`- WABA subscription ensured: ${String(live.subscriptionEnsured === true)}`);
  console.log(`- next action: ${live.nextAction || "unknown"}`);
  console.log(`- blockers: ${asList(live.blockers).join(", ") || "none"}`);
  console.log(`- message: ${live.userMessage || "none"}`);

  if (requireLive && !live.liveReady) {
    console.error("WhatsApp is not live-ready.");
    process.exitCode = 1;
  }

  if (requireLive && live.subscriptionEnsured !== true) {
    console.error("WhatsApp WABA subscription is not confirmed for the Kodi app.");
    process.exitCode = 1;
  }
}
