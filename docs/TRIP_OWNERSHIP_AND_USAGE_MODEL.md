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

## MVP Implication

The current MVP can keep using server-side Render environment variables.

Future production should add:

- `trip_owner_id` on trip groups.
- `usage_pool_id` or equivalent billing/plan reference.
- Usage counters for AI, Places, Routes, and OAuth sync jobs.
- Admin UI for plan status and usage.
- Rate limiting by trip group and by member.

This decision is independent of Google Maps OAuth.
OAuth controls access to the owner's Google trip data; the usage model controls who pays for Kodi's AI and API work.
