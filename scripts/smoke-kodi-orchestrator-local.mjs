#!/usr/bin/env node

import { spawn } from "node:child_process";

const port = 3101;
const baseUrl = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["apps/api/dist/server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true
});

async function waitForHealth() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      const payload = await response.json();
      if (response.ok && payload.ok) {
        return payload;
      }
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Local Kodi server did not become ready.");
}

try {
  await waitForHealth();
  const readinessResponse = await fetch(`${baseUrl}/api/agent/providers/readiness`);
  const readiness = await readinessResponse.json();
  if (!readinessResponse.ok || readiness.totalBudgetMs !== 20_000) {
    throw new Error(`Unexpected readiness: ${JSON.stringify(readiness)}`);
  }

  const agentResponse = await fetch(`${baseUrl}/api/agent/message`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tripGroupId: "test",
      member: { id: "owner", displayName: "מנהל", role: "owner" },
      message: "קודי, איזה בית קפה יש לידי?",
      recentMessages: [{ author: "מנהל", text: "קודי, איזה בית קפה יש לידי?", source: "member" }]
    })
  });
  const agent = await agentResponse.json();
  if (
    !agentResponse.ok ||
    agent.contextSummary?.freshCurrentLocationRequired !== true ||
    agent.agentRuntime?.openAiStatus === "location_required"
  ) {
    throw new Error(`Unexpected missing-location behavior: ${JSON.stringify(agent)}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      strategy: readiness.strategy,
      budgetMs: readiness.totalBudgetMs,
      source: agent.source,
      aiStatus: agent.agentRuntime?.aiStatus,
      freshCurrentLocationRequired: agent.contextSummary?.freshCurrentLocationRequired
    })
  );
} finally {
  server.kill();
}
