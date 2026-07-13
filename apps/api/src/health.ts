export function buildHealthPayload() {
  return {
    ok: true,
    service: "ai-travel-companion-api",
    version: "0.1.0",
    agentContractVersion: "intelligent-agent-runtime-v3",
    gitCommit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? undefined
  };
}
