#!/usr/bin/env node

const args = process.argv.slice(2);
const requireLive = args.includes("--require-live");
const baseArg = args.find((arg) => !arg.startsWith("--"));
const baseUrl = (baseArg || process.env.KODI_PUBLIC_URL || "https://kodi-travel-companion.onrender.com").replace(/\/$/, "");

const probeMessage =
  "קודי, האם הטיול הזה מתאים למשפחה עם ילדים ומה היית משנה כדי שיהיה זורם יותר?";

function classifyProviderIssue(runtime = {}, source = "unknown") {
  if (source === "openai" && runtime.openAiStatus === "ready" && !runtime.fallbackUsed) {
    return {
      kind: "none",
      nextAction: "none"
    };
  }

  const error = String(runtime.openAiError || "");
  if (/429|quota|billing/i.test(error)) {
    return {
      kind: "ai_provider_quota",
      nextAction: "Fix the configured AI provider billing/quota, or replace the backend AI key in Render."
    };
  }
  if (/gemini_fallback_not_configured|GEMINI_API_KEY|GOOGLE_AI_API_KEY/i.test(error)) {
    return {
      kind: "gemini_not_configured",
      nextAction: "Configure GEMINI_API_KEY or GOOGLE_AI_API_KEY in Render and redeploy."
    };
  }
  if (runtime.openAiStatus === "not_configured") {
    return {
      kind: "ai_provider_not_configured",
      nextAction: "Configure at least one backend AI provider key: OPENAI_API_KEY, GEMINI_API_KEY, or GOOGLE_AI_API_KEY."
    };
  }
  if (runtime.fallbackUsed) {
    return {
      kind: "rules_fallback",
      nextAction: "Investigate why the AI provider was skipped or failed; Kodi is answering from rules, not the agent."
    };
  }
  return {
    kind: "none",
    nextAction: "none"
  };
}

async function main() {
  const response = await fetch(`${baseUrl}/api/agent/message`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      tripGroupId: "demo",
      member: {
        id: "owner-1",
        displayName: "מנהל הטיול",
        role: "owner"
      },
      message: probeMessage,
      recentMessages: [
        {
          author: "מנהל הטיול",
          text: probeMessage,
          source: "member"
        }
      ]
    })
  });

  const payload = await response.json().catch(() => undefined);
  if (!response.ok || !payload) {
    console.error(`Kodi agent provider smoke failed: HTTP ${response.status}`);
    process.exitCode = 1;
    return;
  }

  const runtime = payload.agentRuntime || {};
  const issue = classifyProviderIssue(runtime, payload.source || "unknown");
  const summary = {
    baseUrl,
    source: payload.source || "unknown",
    openAiStatus: runtime.openAiStatus || "unknown",
    openAiModel: runtime.openAiModel || "unknown",
    openAiError: runtime.openAiError || "none",
    fallbackUsed: Boolean(runtime.fallbackUsed),
    latencyMs: runtime.latencyMs,
    issue: issue.kind,
    nextAction: issue.nextAction,
    answerPreview: String(payload.text || "").slice(0, 220)
  };

  console.log("Kodi agent provider readiness");
  for (const [key, value] of Object.entries(summary)) {
    console.log(`- ${key}: ${value}`);
  }

  if (requireLive && (payload.source !== "openai" || runtime.openAiStatus !== "ready" || runtime.fallbackUsed)) {
    console.error("Kodi agent is not live-ready: the response did not come from the AI provider.");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
