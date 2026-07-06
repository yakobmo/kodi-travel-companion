# Kodi Agent Engineering README

This document defines how Kodi should be specified, built, tested, and improved as an AI agent.

It complements the product specs:

- `docs/KODI_AGENT_SPEC.md`
- `docs/KODI_AGENT_MASTER_SPEC_HE.md`
- `docs/GOOGLE_INTEGRATION_PLAN.md`
- `docs/AGENT_LESSONS_AND_BLOCKERS.md`

## Why This Exists

Kodi must not be treated as a long prompt with random patches.

Kodi is the core product value:

```text
Google Maps is the map.
Kodi is the intelligent travel agent layer over the map, the trip points, the live location, and the group chat.
```

When Kodi fails, the fix should start from the agent harness, not only from wording.

## Research Sources

Official OpenAI agent guidance used for this README:

- OpenAI Agents SDK overview: `https://developers.openai.com/api/docs/guides/agents`
- Agents quickstart: `https://developers.openai.com/api/docs/guides/agents/quickstart`
- Agent definitions: `https://developers.openai.com/api/docs/guides/agents/define-agents`
- Running agents and conversation state: `https://developers.openai.com/api/docs/guides/agents/running-agents`
- Orchestration and handoffs: `https://developers.openai.com/api/docs/guides/agents/orchestration`
- Agent improvement loop with traces and evals: `https://developers.openai.com/cookbook/examples/agents_sdk/agent_improvement_loop`

Key lessons from the research:

- A real agent is a runtime loop, not a single response prompt.
- The harness includes prompt, model, tools, routing rules, output contract, validation, observability, and regression tests.
- One application turn should do: model call, tool calls if needed, more model calls if needed, then final answer.
- State strategy must be explicit. Do not mix local chat replay, server-managed state, and hidden fallbacks without a contract.
- Split specialists only when a different agent truly needs different tools, policies, or ownership. Otherwise keep Kodi as the main owner and call helper tools.
- Debug with traces/logs/evals before changing prompts.

## Kodi Agent Harness

Kodi should be built as an explicit harness:

```text
User message
-> conversation routing gate
-> context builder
-> intent/context resolver
-> tool planner
-> tool execution
-> answer synthesis
-> action-link post-processing
-> observability
-> persistence
-> regression QA
```

Each layer has one job.

### 1. Conversation Routing Gate

Kodi is not limited to a wake word. The default product behavior is:

- normal trip/group messages are routed to Kodi so the agent can reason from context
- explicit calls such as `קודי`, `קודקס`, `Kodi`, or `Codex` are routed to Kodi
- voice conversation mode routes to Kodi
- direct participant-to-participant messages stay in the group

Kodi must not be intercepted by a hard-coded presence response. The UI/backend should send the conversation event to the agent harness, not to canned `I am here` logic.

Example:

```text
מה קורה אורייה
```

Kodi must stay silent.

Example:

```text
קודי, מה קורה עם המסלול היום?
```

Kodi should answer.

### 2. Context Builder

Before the model thinks, the backend should build a compact, reliable context packet:

- speaker: id, display name, role, age group
- recent group messages, excluding fake/system errors
- current live location, if consented and fresh
- selected map point
- imported Google Maps trip points
- lodging timeline
- active route or destination
- permission policy
- tool results already fetched

Never let stale generated answers become trusted context.

### 3. Intent And Anchor Resolver

Kodi must resolve two things before tool use:

- What is the user asking?
- What is the geographic/time anchor?

Common anchors:

- here and now: live GPS wins
- current trip day: lodging/timeline wins
- future area: future lodging/region wins
- selected place: selected map marker wins
- whole trip: imported trip route wins

Known high-risk phrases:

- `באזור שלי`
- `בסביבה שלי`
- `קרוב אליי`
- `איפה אני עכשיו`
- `כאן`

These must force live-location context.

### 4. Tools

Kodi should not answer practical location questions from memory when a tool is needed.

Tool policy:

- Nearby cafe, bakery, restaurant, toilets, pharmacy, fuel: Google Places around live location.
- Walking/navigation details: Google Maps link.
- Driving: Waze link plus Google Maps link.
- ETA and distance: Google Routes.
- Current human-readable place: reverse geocoding.
- Weather, prices, opening hours, road status, exchange/cash: web search or relevant external source.
- Trip point explanation: trip map note first, web search if needed.
- Shared route edit: internal trip layer first, admin approval required.
- Private Google Maps write-back: only after OAuth-supported architecture exists.

### 5. Answer Synthesis

The model should synthesize from tool results and trip context.

Kodi must:

- answer directly
- be warm and natural in Hebrew
- use masculine self-reference: `אני יכול`, `בדקתי`, `אשמח`
- avoid status-panel language
- avoid hidden implementation excuses
- ask one clarification only if truly blocking
- include Waze/Google Maps links when giving a concrete place

Kodi must not:

- say "שמעתי את מנהל הקבוצה"
- end every answer with admin approval boilerplate
- give fake confidence
- return old answers
- fabricate access to private Google Maps
- produce local browser fallback answers pretending to be Kodi

### 6. Output Contract

The API response should include:

- `text`
- `intent`
- `requiresAdminApproval`
- `source`
- `agentRuntime`
- `contextSummary`

The UI should be able to show or log:

- OpenAI status
- fallback status
- tool statuses
- latency
- live-location vs trip-timeline anchor

If the agent fails, the UI should show an explicit local error and must not persist it as a Kodi recommendation.

## Current Architecture Direction

Short term:

- Keep current `/api/agent/message`.
- Keep OpenAI Responses-based implementation.
- Strengthen harness boundaries and regression tests.
- Do not migrate to Agents SDK during unstable product work.

Mid term:

- Add stronger traces for each agent turn.
- Store agent runtime metadata with each persisted Kodi answer.
- Add golden regression cases for every root-cause failure.
- Split rules into explicit tool/result formatting helpers, not full canned replies.

Long term:

- Evaluate OpenAI Agents SDK when Kodi needs managed sessions, structured tracing, built-in handoffs, or a cleaner tool loop.
- Keep Kodi as the main agent. Use helper agents as tools only if they add clear value.

## Regression Cases

Every agent change should test these cases:

1. `קודי איזה בית קפה פתוח יש באזור שלי כרגע?`
   - Must use live location.
   - Must return Google Maps and Waze links.
   - Must not use Greece trip points when GPS is in Israel.

2. `מה קורה אורייה`
   - Frontend must not wake Kodi.

3. `קודי מה אופי הטיול שלנו ביוון?`
   - Must synthesize the trip arc naturally.

4. `קודי סמן לי על המפה את המסלול`
   - Must produce a route diagram or actionable map/route representation.
   - Must not dodge by saying it cannot draw.

5. `קודי איפה אני עכשיו?`
   - Must answer with a readable place/address when reverse geocoding is available.
   - Raw coordinates are fallback only.

6. `קודי ספר לי על הגשר שנעבור בדרך`
   - Must act as a guide.
   - May use web search/fresh facts when needed.

7. `קודי החלף את מפת הטיול לוינה`
   - Must distinguish internal trip-source registration from real private Google Maps OAuth import.

8. Agent timeout or API error
   - Must show explicit connection error.
   - Must not save fake Kodi content into the group chat.

## Build Protocol For Agent Changes

Before changing Kodi:

1. Read this README.
2. Read `docs/KODI_AGENT_MASTER_SPEC_HE.md`.
3. Identify whether the failure is:
   - wake gate
   - context
   - anchor resolution
   - tool query
   - model prompt
   - post-processing
   - UI persistence
   - latency/timeout
   - Google/OAuth limitation
4. Add or update a regression check.
5. Then edit code.

After changing Kodi:

1. Run build.
2. Run QA.
3. Run local smoke if UI/API changed.
4. Run agent regression.
5. Commit only if evidence passes.
6. Push and run public smoke after Render deploy.

## Commands

Local build:

```bash
npm run build
```

QA:

```bash
npm run qa
```

Agent regression against public Render:

```bash
npm run agent:regression
```

Agent regression against a local server:

```bash
KODI_AGENT_BASE_URL=http://127.0.0.1:10000 npm run agent:regression
```

## Definition Of Done For Kodi Agent Work

A Kodi agent change is not done until:

- it is tied to a product expectation
- the affected harness layer is named
- build passes
- QA passes
- at least one relevant regression case passes
- public smoke passes after deploy when production behavior changed
- no fake local Kodi answer can be persisted as agent memory
