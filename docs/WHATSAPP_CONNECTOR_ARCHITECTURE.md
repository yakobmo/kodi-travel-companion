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
2. Store inbound WhatsApp messages as normal group messages.
3. Let Kodi answer through the same agent pipeline.
4. Send outbound WhatsApp replies through Meta Cloud API.
5. Add group-mode support only if Meta permissions and product rules allow it.

## QA Rules

- Readiness must work without Meta configuration.
- Webhook verification must reject invalid tokens.
- POST webhook must parse text messages without writing to chat in V1.
- The connector must not expose phone numbers except masked IDs.
- The connector must not bypass owner/admin rules for operational actions.
