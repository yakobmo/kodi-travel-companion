#!/usr/bin/env node

process.env.KODI_FREE_PROVIDER_ORDER = "groq,cloudflare,openrouter";
process.env.KODI_PROVIDER_ATTEMPT_TIMEOUT_MS = "2500";
process.env.GROQ_API_KEY = "test-groq";
process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
process.env.CLOUDFLARE_AI_TOKEN = "test-cloudflare";
process.env.CLOUDFLARE_AGENT_MODEL = "@cf/test/qualified-model";
process.env.OPENROUTER_API_KEY = "test-openrouter";

const originalFetch = globalThis.fetch;
const calls = [];

globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (String(url).includes("groq.com")) {
    return new Response(JSON.stringify({ error: "quota exhausted" }), {
      status: 429,
      headers: { "retry-after": "120" }
    });
  }
  if (String(url).includes("cloudflare.com")) {
    return new Response(JSON.stringify({ error: "temporary outage" }), { status: 503 });
  }

  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              text: "תשובת גיבוי תקינה",
              intent: "general",
              requiresAdminApproval: false
            })
          }
        }
      ]
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
};

try {
  const { getFreeProviderFleetReadiness, tryFreeProviderFleet } = await import(
    "../apps/api/dist/agent/providerFleet.js"
  );
  const request = {
    instructions: "Return JSON",
    payload: "{}",
    reasoningMode: false,
    fallbackIntent: "general",
    parseReply(output) {
      return { author: "קודי", source: "ai_provider", ...JSON.parse(output) };
    }
  };

  const first = await tryFreeProviderFleet(request);
  if (first.status !== "ready" || first.model !== "openrouter:openrouter/free") {
    throw new Error(`Expected OpenRouter fallback, received ${JSON.stringify(first)}`);
  }
  if (calls.length !== 3) {
    throw new Error(`Expected three provider attempts, received ${calls.length}`);
  }

  const readiness = getFreeProviderFleetReadiness();
  const groq = readiness.providers.find((provider) => provider.provider === "groq");
  const cloudflare = readiness.providers.find((provider) => provider.provider === "cloudflare");
  if (groq?.state !== "cooling_down" || cloudflare?.state !== "cooling_down") {
    throw new Error(`Expected failed providers to have open circuits: ${JSON.stringify(readiness)}`);
  }

  const second = await tryFreeProviderFleet(request);
  if (second.status !== "ready" || calls.length !== 4) {
    throw new Error(`Expected open circuits to skip failed providers: ${JSON.stringify(second)}`);
  }

  console.log("Provider fleet failover test passed.");
} finally {
  globalThis.fetch = originalFetch;
}
