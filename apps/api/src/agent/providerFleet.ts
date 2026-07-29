import type { AgentMessageResponse } from "./kodi.js";

type FleetProviderId = "groq" | "cloudflare" | "openrouter";

export interface FreeProviderFleetResult {
  status: "ready" | "not_configured" | "error";
  reply?: AgentMessageResponse;
  model?: string;
  error?: string;
  providerAttempts: string[];
}

interface ProviderCircuit {
  failureCount: number;
  cooldownUntil: number;
  lastError?: string;
}

interface FleetInput {
  instructions: string;
  payload: string;
  reasoningMode: boolean;
  fallbackIntent: AgentMessageResponse["intent"];
  parseReply: (output: string, fallbackIntent: AgentMessageResponse["intent"]) => AgentMessageResponse;
  deadlineAt?: number;
}

const providerCircuits = new Map<FleetProviderId, ProviderCircuit>();
let lastSuccessfulProvider: { provider: FleetProviderId; model: string; at: string } | undefined;

function getAttemptTimeoutMs() {
  const configured = Number(process.env.KODI_PROVIDER_ATTEMPT_TIMEOUT_MS ?? 5500);
  return Number.isFinite(configured) ? Math.min(Math.max(Math.round(configured), 2500), 9000) : 5500;
}

function getFreeProviderOrder(): FleetProviderId[] {
  const configured = process.env.KODI_FREE_PROVIDER_ORDER?.split(",")
    .map((provider) => provider.trim().toLowerCase())
    .filter((provider): provider is FleetProviderId =>
      provider === "groq" || provider === "cloudflare" || provider === "openrouter"
    );

  return configured?.length ? Array.from(new Set(configured)) : ["openrouter", "cloudflare", "groq"];
}

function getProviderConfig(provider: FleetProviderId) {
  if (provider === "groq") {
    return {
      configured: Boolean(process.env.GROQ_API_KEY?.trim()),
      model: process.env.GROQ_AGENT_MODEL?.trim() || "llama-3.3-70b-versatile"
    };
  }
  if (provider === "cloudflare") {
    return {
      configured: Boolean(
        process.env.CLOUDFLARE_ACCOUNT_ID?.trim() &&
          process.env.CLOUDFLARE_AI_TOKEN?.trim()
      ),
      model: process.env.CLOUDFLARE_AGENT_MODEL?.trim() || "@cf/meta/llama-3.1-8b-instruct-fp8-fast"
    };
  }

  return {
    configured: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    model: process.env.OPENROUTER_AGENT_MODEL?.trim() || "openrouter/free"
  };
}

function getCircuit(provider: FleetProviderId) {
  return providerCircuits.get(provider) ?? { failureCount: 0, cooldownUntil: 0 };
}

function recordSuccess(provider: FleetProviderId, model: string) {
  providerCircuits.delete(provider);
  lastSuccessfulProvider = {
    provider,
    model,
    at: new Date().toISOString()
  };
}

function parseRetryAfterMs(value: string | null) {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(date - Date.now(), 0) : undefined;
}

function recordFailure(provider: FleetProviderId, status: number | undefined, message: string, retryAfterMs?: number) {
  const previous = getCircuit(provider);
  const failureCount = previous.failureCount + 1;
  const defaultCooldownMs =
    status === 429
      ? 15 * 60_000
      : status === 401 || status === 403
        ? 60 * 60_000
        : status && status >= 500
          ? 60_000
          : message.includes("timeout")
            ? 45_000
            : Math.min(30_000 * 2 ** Math.min(failureCount - 1, 4), 10 * 60_000);

  providerCircuits.set(provider, {
    failureCount,
    cooldownUntil: Date.now() + Math.max(retryAfterMs ?? 0, defaultCooldownMs),
    lastError: message.slice(0, 180)
  });
}

async function fetchProviderJson(provider: FleetProviderId, url: string, init: RequestInit, deadlineAt?: number) {
  const controller = new AbortController();
  const remainingMs = deadlineAt ? Math.max(deadlineAt - Date.now(), 0) : getAttemptTimeoutMs();
  if (remainingMs < 500) {
    throw new Error("ai_agent_deadline_exhausted");
  }
  const providerTimeoutMs = provider === "openrouter" ? Math.max(getAttemptTimeoutMs(), 8_000) : getAttemptTimeoutMs();
  const timeoutId = setTimeout(() => controller.abort(), Math.min(providerTimeoutMs, remainingMs));

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`${provider}_http_${response.status}: ${text.slice(0, 220)}`) as Error & {
        status?: number;
        retryAfterMs?: number;
      };
      error.status = response.status;
      error.retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      throw error;
    }

    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${provider}_timeout`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function callOpenAiCompatibleProvider(provider: "groq" | "openrouter", input: FleetInput, model: string) {
  const isGroq = provider === "groq";
  const endpoint = isGroq
    ? "https://api.groq.com/openai/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  const apiKey = isGroq ? process.env.GROQ_API_KEY?.trim() : process.env.OPENROUTER_API_KEY?.trim();
  const response = (await fetchProviderJson(provider, endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(isGroq
        ? {}
        : {
            "HTTP-Referer": process.env.APP_BASE_URL?.trim() || "https://kodi-travel-companion.onrender.com",
            "X-Title": "Kodi Travel Companion"
          })
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: input.instructions },
        { role: "user", content: input.payload }
      ],
      max_tokens: input.reasoningMode ? 1800 : 1400,
      temperature: input.reasoningMode ? 0.55 : 0.45,
      ...(isGroq ? { response_format: { type: "json_object" } } : {})
    })
  },
    input.deadlineAt
  )) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return response.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callCloudflareProvider(input: FleetInput, model: string) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_AI_TOKEN?.trim();
  const response = (await fetchProviderJson(
    "cloudflare",
    `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId ?? "")}/ai/run/${model}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [
          { role: "system", content: input.instructions },
          { role: "user", content: input.payload }
        ],
        max_tokens: input.reasoningMode ? 1800 : 1400,
        temperature: input.reasoningMode ? 0.55 : 0.45
      })
    },
    input.deadlineAt
  )) as {
    success?: boolean;
    result?: { response?: string };
  };

  return response.result?.response?.trim() ?? "";
}

export function hasFreeFleetProvider() {
  return getFreeProviderOrder().some((provider) => getProviderConfig(provider).configured);
}

export function getFreeProviderFleetReadiness() {
  return {
    order: getFreeProviderOrder(),
    attemptTimeoutMs: getAttemptTimeoutMs(),
    lastSuccessfulProvider,
    providers: getFreeProviderOrder().map((provider) => {
      const config = getProviderConfig(provider);
      const circuit = getCircuit(provider);
      return {
        provider,
        model: config.model,
        configured: config.configured,
        state:
          !config.configured
            ? "not_configured"
            : circuit.cooldownUntil > Date.now()
              ? "cooling_down"
              : "ready",
        failureCount: circuit.failureCount,
        cooldownUntil: circuit.cooldownUntil > Date.now() ? new Date(circuit.cooldownUntil).toISOString() : undefined,
        lastError: circuit.lastError
      };
    })
  };
}

export async function tryFreeProviderFleet(input: FleetInput): Promise<FreeProviderFleetResult> {
  const attempts: string[] = [];
  let configuredCount = 0;

  for (const provider of getFreeProviderOrder()) {
    if (input.deadlineAt && input.deadlineAt - Date.now() < 500) {
      attempts.push("fleet:deadline_exhausted");
      break;
    }
    const config = getProviderConfig(provider);
    if (!config.configured) {
      continue;
    }
    configuredCount += 1;

    const circuit = getCircuit(provider);
    if (circuit.cooldownUntil > Date.now()) {
      attempts.push(`${provider}:${config.model}:circuit_open_until_${new Date(circuit.cooldownUntil).toISOString()}`);
      continue;
    }

    try {
      const output =
        provider === "cloudflare"
          ? await callCloudflareProvider(input, config.model)
          : await callOpenAiCompatibleProvider(provider, input, config.model);
      if (!output) {
        throw new Error(`${provider}_empty_response`);
      }

      const reply = input.parseReply(output, input.fallbackIntent);
      recordSuccess(provider, config.model);
      return {
        status: "ready",
        model: `${provider}:${config.model}`,
        reply,
        providerAttempts: [...attempts, `${provider}:${config.model}:ready`]
      };
    } catch (error) {
      const providerError = error as Error & { status?: number; retryAfterMs?: number };
      const message = providerError instanceof Error ? providerError.message : String(error);
      recordFailure(provider, providerError.status, message, providerError.retryAfterMs);
      attempts.push(`${provider}:${config.model}:${message.slice(0, 160)}`);
    }
  }

  if (configuredCount === 0) {
    return { status: "not_configured", error: "free_provider_fleet_not_configured", providerAttempts: attempts };
  }

  return { status: "error", error: "free_provider_fleet_exhausted", providerAttempts: attempts };
}
