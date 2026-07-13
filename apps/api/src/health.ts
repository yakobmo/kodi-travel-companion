export function buildHealthPayload() {
  return {
    ok: true,
    service: "ai-travel-companion-api",
    version: "0.1.0",
    agentContractVersion: "fresh-location-contract-v2",
    gitCommit: process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? undefined
  };
}
