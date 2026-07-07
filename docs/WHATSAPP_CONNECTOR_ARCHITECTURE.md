# WhatsApp Connector Architecture

## Product Role

WhatsApp is a transport channel, not a second brain.

Kodi remains the travel agent. The app remains the source of truth for:

- trip group membership
- Google Maps trip points
- live location permissions
- Kodi conversation history
- owner/admin operational authority

The WhatsApp connector should let family members talk to the same Kodi/group context from WhatsApp when that becomes available.

## V1 - Dry Connector

Implemented now:

- `GET /api/whatsapp/readiness`
- `GET /api/whatsapp/webhook`
- `POST /api/whatsapp/webhook`
- safe parser for Meta WhatsApp Cloud API webhook payloads
- dry routing plan from WhatsApp text messages to the Kodi group context
- no real outbound WhatsApp messages
- no automatic write into the group chat yet
- no secrets exposed to the browser or readiness response

This step proves that the server has a stable connector boundary before we connect a real WhatsApp number.

## Required Environment Variables

- `WHATSAPP_CONNECTOR_ENABLED`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `APP_BASE_URL`

`WHATSAPP_ACCESS_TOKEN` is backend-only. It must never be sent to the browser.

## Future Steps

1. Link WhatsApp phone numbers to existing trip members.
2. Add durable DB idempotency for Meta webhook retries.
3. Add Meta app setup and production webhook subscription.
4. Add group-mode support only if Meta permissions and product rules allow it.

## V2 - Live-Capable Bridge

Implemented after V1:

- when all WhatsApp env vars are configured, inbound text messages are accepted as live messages
- sender profile name is matched/created as a normal trip member
- inbound WhatsApp text is stored as a normal group chat message
- Kodi is called through the same `/api/agent/message` pipeline used by the app
- Kodi's reply is stored back into the group chat
- Kodi's reply is sent back to the WhatsApp sender through Meta Cloud API
- duplicate Meta message IDs are ignored in-process to reduce webhook retry duplication

V2 still treats WhatsApp as a transport. Kodi's permissions, trip context, Google Maps grounding, and owner/admin rules stay in the main app backend.

## QA Rules

- Readiness must work without Meta configuration.
- Webhook verification must reject invalid tokens.
- POST webhook must parse text messages without writing to chat in V1.
- When configured, POST webhook must use the same Kodi agent pipeline rather than a separate bot answer.
- Outbound WhatsApp sending must use backend-only `WHATSAPP_ACCESS_TOKEN`.
- The connector must not expose phone numbers except masked IDs.
- The connector must not bypass owner/admin rules for operational actions.
