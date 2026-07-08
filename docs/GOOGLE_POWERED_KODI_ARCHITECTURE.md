# Google-Powered Kodi Architecture Decision

Status: accepted for implementation planning  
Date: 2026-07-08

## Decision

Kodi remains the travel agent.

Google remains the geographic source of truth.

WhatsApp remains an additional communication channel for Kodi.

The product should not try to call the consumer Google Search or Google Maps AI answer box as a hidden backend agent. That is not a supported product API contract for Kodi. Instead, Kodi should use official Google interfaces as tools:

- Google Maps JavaScript API for the visible map.
- Google Places API for nearby places, categories, ratings, addresses, and Google Maps links.
- Google Routes API for ETA, distance, and route feasibility.
- Geocoding / reverse geocoding for human-readable current location.
- Maps URLs for handoff to native Google Maps.
- Waze deep links for driving handoff.
- Future Google OAuth only for permissioned user-account data and any supported sync path.

Gemini can be added later as an optional AI provider or grounding provider, but it does not replace the product architecture. Kodi still owns the trip context, permissions, group chat behavior, WhatsApp bridge, and action policy.

## Non-Negotiables

1. Do not remove or weaken WhatsApp.
   WhatsApp is a supported access channel for talking with Kodi. It is not a replacement for the app, and the app is not a replacement for WhatsApp.

2. Do not pretend Kodi has private Google Maps write access before OAuth and a supported API path exist.
   Kodi may edit the Kodi trip layer after admin approval. Google account write-back is a separate future capability.

3. Do not answer local practical questions from memory when Google data is needed.
   Questions such as "cafe near me", "bakery nearby", "restaurant around us", "fuel", "toilets", "pharmacy", or "attraction near the hotel" should resolve a geographic anchor and call Google Places when configured.

4. Do not use stale location for "near me".
   Location-dependent queries must prefer a fresh device/browser location, or clearly ask for location refresh when fresh location is unavailable.

5. Do not turn Kodi into a canned bot.
   Kodi should answer naturally in Hebrew, use tools, reason over context, and provide practical next actions.

## Source Of Truth Layers

| Layer | Source of truth | Purpose |
| --- | --- | --- |
| Product state | App backend / Supabase | trip account, members, roles, chat, invites, permissions, usage |
| Trip map layer | Kodi trip layer | imported points, ordering, categories, notes, admin-approved edits |
| Visual map | Google Maps JavaScript API | original map interaction and familiar map experience |
| Geographic data | Google Places / Routes / Geocoding | search, recommendations, ETA, distance, current place names |
| Conversation | App chat, mirrored through WhatsApp when enabled | group dialogue and Kodi interaction |
| AI reasoning | Kodi agent provider | synthesis, prioritization, explanation, and planning |

## Request Routing

### Nearby or "here and now"

Examples:

- "Kodi, find a good cafe near me."
- "Where is the closest bakery?"
- "Is there a pharmacy around us?"

Required flow:

1. Resolve fresh current location.
2. Reverse geocode to a human-readable area when useful.
3. Call Google Places with location bias.
4. Rank by relevance, rating, review count, distance, opening status, and family fit.
5. Return one clear recommendation first.
6. Include a Google Maps link.
7. Include a Waze link when the likely action is driving.

### Planned trip context

Examples:

- "Kodi, in two days near our Pelion hotel, find a beach."
- "How long from Athens airport to Hotel Marathia?"
- "Will we reach Rio-Antirrio bridge before dark?"

Required flow:

1. Resolve trip segment from itinerary, lodging, selected point, or recent conversation.
2. Use Routes for ETA/distance when route feasibility matters.
3. Use Places around the resolved lodging/region when looking for nearby services or attractions.
4. Explain assumptions briefly.
5. Provide action links.

### Map edits

Examples:

- "Kodi, add this beach to our route."
- "Remove this point."
- "Move Pelion beach before lunch."

Required flow:

1. Confirm the actor has admin rights.
2. Explain the proposed change.
3. Write to the Kodi trip layer only after approval.
4. Audit the change.
5. Say clearly whether this updated only Kodi or also Google, depending on actual capability.

### WhatsApp

WhatsApp messages must enter the same Kodi agent pipeline as app-chat messages.

WhatsApp must not have a separate "simple bot" brain.

The connector should:

- receive inbound WhatsApp text,
- match or create the participant safely,
- store the group message,
- call the same Kodi agent pipeline,
- store Kodi's answer,
- send Kodi's answer back through WhatsApp when live sending is configured.

## Gemini / Google AI Provider Option

Adding Gemini can be useful for:

- Google-grounded answers when live web grounding is needed,
- large context windows,
- comparing answer quality and cost,
- provider redundancy when OpenAI is unavailable.

Adding Gemini should be done behind an adapter, not by changing product behavior directly:

```text
Kodi Agent Harness
  -> provider adapter: openai | gemini
  -> same context packet
  -> same tool policy
  -> same output contract
  -> same QA scenarios
```

Gemini is not a shortcut around Google Maps OAuth, private user-data permissions, or WhatsApp production setup.

## Implementation Plan

### Phase 1 - Architecture guardrails

- Add this decision document.
- Link it from the Google integration plan, WhatsApp architecture, and agent engineering README.
- Keep WhatsApp explicitly protected as a communication channel.

### Phase 2 - Agent health and provider readiness

- Add/verify an endpoint that reports Kodi agent provider readiness without exposing secrets.
- Fail visibly when the provider is unavailable instead of returning fake canned answers.
- Keep a regression set for natural Hebrew agent behavior.

### Phase 3 - Google-first local discovery

- Harden "near me" routing:
  - fresh location required,
  - reverse geocoding,
  - Places lookup,
  - one best answer first,
  - Google Maps and Waze links.

### Phase 4 - Trip source sync clarity

- Add visible sync status:
  - active source name,
  - point count in Kodi,
  - last sync/check time,
  - whether Google OAuth/live sync is active.
- If the user says Google has a different point count, Kodi should report a sync mismatch rather than inventing.

### Phase 5 - WhatsApp hardening

- Keep permanent Meta System User token flow.
- Keep readiness diagnostics for:
  - token validity,
  - phone access,
  - WABA/app subscription,
  - recent inbound webhooks,
  - outbound send status.
- Do not edit WhatsApp connector code unless diagnostics point to connector processing as the root cause.

### Phase 6 - Optional Gemini adapter

- Add only after Phase 2 and Phase 3 are stable.
- Run the same agent regression suite against both providers.
- Enable by environment flag, not by removing the OpenAI path.

## QA Gates

Every implementation step that touches this decision must check:

- WhatsApp remains documented and available as a Kodi communication channel.
- Google Maps remains the map/geographic source, not a hidden consumer-AI scrape.
- Kodi remains the agent layer.
- "Near me" tests use fresh location or ask for refresh.
- Place recommendations include Google Maps links and Waze links when driving is relevant.
- Agent fallback does not pretend to be the full agent.

## Official References

- Google Places API Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search
- Google Routes API: https://developers.google.com/maps/documentation/routes
- Gemini grounding with Google Search: https://ai.google.dev/gemini-api/docs/google-search
- WhatsApp Cloud API webhooks: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
