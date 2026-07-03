# Chat Push Notifications Architecture

## Product Intent

Kodi should behave like a familiar messaging app.

When a group member or Kodi sends a new relevant chat message, other participants should receive a mobile notification, similar to WhatsApp or Telegram.

Hebrew product example:

```text
נועה שלחה הודעה בקבוצת הטיול.
עומרי מקבל התראה בטלפון גם אם האפליקציה לא פתוחה.
הקשה על ההתראה פותחת את Kodi ישירות לשיחת הקבוצה.
```

## Product Boundary

This is push notification infrastructure, not only an in-app badge.

There are two levels:

1. In-app unread state: works while the app is open.
2. Push notifications: work when the app is closed or in the background, subject to browser/device support and user permission.

The product goal is level 2.

## UX Principle

The app should ask for notification permission only after the user has joined the trip group and understands why it is useful.

Recommended Hebrew copy:

```text
רוצה לקבל התראות כשיש הודעות חדשות בקבוצת הטיול?
אפשר לשנות זאת בכל רגע מההגדרות.
```

Do not ask for notification permission during first-load before the user understands the app.

The notification entry point should live in the hamburger/settings area first:

```text
התראות הודעות
```

States:

- `לא הופעל`
- `מבקש הרשאה`
- `פעיל`
- `חסום בדפדפן`
- `לא נתמך במכשיר הזה`

## Web/PWA Constraint

Kodi is currently a web/PWA app.

Push notifications require:

- HTTPS production URL.
- Service Worker.
- Browser Push API support.
- User permission.
- Push subscription saved on the backend.
- Backend push sender keys.

On some mobile platforms, push notifications may require the app to be installed to the home screen. Native app packaging can improve reliability later, but the first implementation should use Web Push because Kodi already has a PWA foundation.

## Data Architecture

Use PostgreSQL for notification subscriptions and preferences.

Recommended tables:

```text
push_subscriptions
notification_preferences
notification_deliveries
```

`push_subscriptions` should store:

- `id`
- `trip_group_id`
- `member_id`
- `endpoint`
- `p256dh`
- `auth`
- `user_agent`
- `created_at`
- `last_seen_at`
- `revoked_at`

`notification_preferences` should store:

- `trip_group_id`
- `member_id`
- `chat_messages_enabled`
- `kodi_mentions_enabled`
- `quiet_hours_start`
- `quiet_hours_end`
- `updated_at`

`notification_deliveries` should store:

- `trip_group_id`
- `message_id`
- `recipient_member_id`
- `subscription_id`
- `status`
- `provider_error`
- `created_at`
- `sent_at`

## Backend Flow

When a chat message is created:

1. Persist the message in `group_messages`.
2. Record the `message_created` event.
3. Determine notification recipients:
   - same trip group
   - active members only
   - exclude the sender
   - respect member notification preferences
   - optionally prioritize direct Kodi mentions later
4. Send Web Push notifications through the backend.
5. Record delivery status without exposing provider secrets.

Notification text should be short and safe:

```text
קבוצת הטיול
עומרי: איפה נפגשים?
```

For Kodi:

```text
קודי ענה בקבוצת הטיול
פתח כדי לראות את ההמלצה
```

Avoid putting sensitive location details in lock-screen notifications by default.

## Frontend Flow

The browser should:

1. Check support for `Notification`, `serviceWorker`, and `PushManager`.
2. Ask permission only after user action.
3. Subscribe through the Service Worker.
4. Send the subscription to the backend with the current member identity.
5. Show current notification status in the hamburger/settings area.

The Service Worker should:

- receive push events
- show a notification
- open/focus Kodi on click
- route to the group chat

## Secrets And Environment

Backend-only:

```text
VAPID_PRIVATE_KEY
```

Browser-safe:

```text
VAPID_PUBLIC_KEY
```

Do not commit generated keys.

Do not expose private keys through `VITE_*`.

## Permissions And Privacy

Notifications are opt-in per device.

A participant may be logged into the trip on multiple devices; each device has its own subscription.

A participant leaving the group should revoke or ignore subscriptions for that group.

Owner/admin cannot silently force notifications on another participant's phone.

## Implementation Stages

### V1 - In-App Readiness And Preferences

- Add notification architecture and QA gates.
- Add UI placeholder/status in settings.
- Add `notification_preferences` and `push_subscriptions` schema plan.
- Do not send real push yet.

### V2 - Web Push MVP

- Generate VAPID keys and configure Render.
- Add backend subscription endpoints.
- Add Service Worker push handler.
- Send notifications for new member messages and Kodi replies.
- Exclude the sender.
- Add local/public smoke for subscription capability and safe invalid-subscription handling.

Implementation note:

- Subscription registration is stored in `push_subscriptions` when Supabase is active, with local in-memory fallback only for development.
- Enabling notifications writes `notification_preferences.chat_messages_enabled=true` for the member.
- Each send attempt should create a `notification_deliveries` audit row with `sent`, `failed`, or `revoked`.
- Expired subscriptions returned by the push provider as 404/410 should be revoked automatically.
- A server is considered push-ready only when both `VAPID_PUBLIC_KEY` and backend-only `VAPID_PRIVATE_KEY` are configured.
- `pnpm notifications:vapid` generates a fresh Render variable block for `VAPID_PUBLIC_KEY`, backend-only `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`.
- Generated VAPID values are secrets and must remain outside Git.

### V3 - Messaging-App Polish

- Unread badge.
- Mention/Kodi priority.
- Quiet hours.
- Mute group.
- Per-trip notification settings.
- Notification click opens the exact chat context.

### V4 - Native Reliability Option

If Web Push is not reliable enough for family testing, evaluate native wrappers or native mobile apps with platform push services.

## Current Decision

Add push notifications to the product architecture now.

Do not claim WhatsApp-level reliability until Web Push is implemented, tested on the target phones, and device/browser constraints are documented.
