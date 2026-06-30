# Trip Ownership And Usage Model

## Product Decision

Kodi is a shared trip-space agent, not a separate paid AI account for every participant.

One trip owner creates the trip space, connects the required services, and owns the usage pool for the group.
Family members join that trip space and can talk to Kodi inside the shared conversation without buying their own AI model subscription.

## Roles

- `Trip Owner`: creates the trip, owns billing/usage, connects Google, and can manage admins.
- `Admin`: can approve operational actions such as setting destination, creating a route, or sending a point to navigation.
- `Member`: can speak in the group chat, ask Kodi questions, suggest tasks, and share location with consent.
- `Viewer`: can observe or participate with limited permissions, useful for children or invited guests.

The product can later support several admins, or a group mode where all adults are admins, similar to WhatsApp group administration.

## Usage Pool

The trip has one usage pool.

All costly work is attributed to the trip space:

- OpenAI agent reasoning.
- Google Places search.
- Google Routes ETA and distance.
- Future Google OAuth sync operations.
- Future enrichment or summarization jobs.

Participants do not bring separate OpenAI keys or Google API keys.
They send messages and actions to Kodi through the application backend.

## Development Stages

### Stage 1 - Working Prototype

The current product target is a usable prototype for one real trip group at a time.

Prototype expectation:

- One deployed Kodi backend holds the system OpenAI, Google, and Supabase credentials.
- A trip manager opens the app, connects/identifies a trip source, enables manager location, and invites participants.
- Participants join through an invite link and do not see Render, OpenAI keys, Google Cloud, or Supabase.
- Kodi can answer through the backend agent bridge and can use Google Maps, Places, Routes, trip points, chat history, and permissions.
- The prototype is good for real family testing and product learning, but it is not yet designed for 1,000 concurrent users.

### Stage 2 - Multi-Trip Product

The next product stage is turning the prototype into a reliable SaaS-style product for many trip groups.

Required capabilities:

- Real authentication and separate trip accounts.
- Persistent trip ownership and participant membership boundaries.
- Invite-token API with expiration, role assignment, and audit.
- Per-trip usage pool records instead of only environment-level provider keys.
- Quotas and budget visibility per trip owner.
- Rate limiting by trip, member, and capability.
- Cached Google Places/Routes results where safe, to reduce cost and latency.
- Clear billing model: subscription, credits, or paid trip package.

### Stage 3 - Scale-Ready Service

Serving hundreds or thousands of concurrent users is an infrastructure stage, not a requirement for the first prototype.

Scale-readiness requires:

- Job queues for slower or expensive agent/tool calls.
- Background workers for enrichment, sync, and summarization.
- Provider rate-limit handling for OpenAI and Google APIs.
- Observability for latency, errors, token usage, Google API usage, and cost.
- Abuse controls so one member or one trip cannot silently consume the whole system budget.
- Horizontal scaling of the API service or a move to infrastructure that supports it.
- Load tests that simulate concurrent chat, location updates, Places, Routes, and realtime streams.

Architecture rule: users never manage Render or provider credentials. Scaling changes the backend and billing layer, not the end-user setup flow.

## Server Boundary

Kodi runs through the backend service.

```text
Group members
↓
Kodi app
↓
Kodi backend service
↓
OpenAI / Google Maps Platform / Supabase
↓
Response back to the group chat
```

The owner may pay for a plan, credits, or a connected provider account, but private credentials stay on the server side.
No participant browser receives the `OPENAI_API_KEY`, `GOOGLE_MAPS_API_KEY`, OAuth client secret, Supabase service-role key, or database URL.

## Permission Model

Everyone can participate in the conversation if allowed by their member permissions.

Operational actions still require the right role:

- Set or change group destination: owner/admin.
- Create or approve a route: owner/admin.
- Mark a group route stop as completed: configured permission, default owner/admin.
- Share a personal live location: the specific member must consent.
- Ask Kodi for information: member-level access is enough.

This means a child can ask, "Kodi, is there ice cream nearby?", but Kodi will not change the route or group destination unless an authorized manager approves.

## Billing And Safety Rules

- Usage limits belong to the trip group or owner account.
- The backend should enforce quotas before making expensive calls.
- The backend should record which member triggered a costly action.
- The product should show clear owner/admin visibility into usage, without exposing secrets.
- Abuse controls should be group-aware: one noisy participant should not silently consume the entire plan without owner visibility.

## Current Implementation Implication

The current implementation uses server-side Render environment variables.

Implemented API foundation:

```text
GET /api/trips/{tripId}/usage
```

The endpoint returns a safe trip usage-pool summary:

- owner/admin identity for the trip group
- `participantBillingRequired=false`
- backend-mediated provider usage
- server-side secret boundary
- capability list for OpenAI agent reasoning, Google Places, Google Routes, and future Google OAuth sync
- policy flags for admin-only operational actions and server-side quota gates

Implemented usage gate:

- Google Places calls pass through `authorizeTripUsageCapability`.
- Google Routes calls pass through `authorizeTripUsageCapability`.
- Kodi agent calls include usage-gate evidence in `contextSummary.usageGateResults`.
- Direct Google endpoints return `usageGate` evidence without exposing provider keys.
- Authorized Google usage is also recorded as a system event in the group event log, with capability, source, charge target, and provider-configuration evidence.
- `/api/trips/{tripId}/usage` returns `usageAudit`, a safe owner-visible summary derived from the group event log.
- The web app shows a compact usage overview near the live activity panel, so the trip owner can see Google Places, Google Routes, Kodi-agent, and direct-API usage counts.
- The current implementation authorizes calls by policy and records the intended charge target as `trip_usage_pool`; production account management can replace this with persistent quotas and billing checks.

Future production should add:

- `trip_owner_id` on trip groups.
- `usage_pool_id` or equivalent billing/plan reference.
- Usage counters for AI, Places, Routes, and OAuth sync jobs.
- Admin UI for plan status and usage.
- Rate limiting by trip group and by member.

This decision is independent of Google Maps OAuth.
OAuth controls access to the owner's Google trip data; the usage model controls who pays for Kodi's AI and API work.
