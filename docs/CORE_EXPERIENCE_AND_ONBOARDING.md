# Core Experience And Onboarding

## Product Heart

Kodi Travel Companion is built around one core experience:

```text
Kodi + live map + trip points + at least the trip manager's live location
```

This is the heart of the app.

Without the manager's live location, Kodi cannot reliably answer "what now?", "what is nearby?", "how long to the hotel?", or "open this in Waze" in a travel-specific way.

Group member locations are a flagship extension, but the minimum viable live context is:

- the trip manager's consented live location
- the imported trip places and lodging points
- Kodi's chat context
- the active day/route/lodging context when available

## UX Principle

The user should see one clear next action at a time.

The app should not start with a checklist, a dense setup form, or several unrelated tasks.

Secondary actions belong in a menu or management surface, not in the first-run path.

## First-Run Flow

Recommended onboarding sequence:

1. Activate Kodi.
2. Kodi explains what it needs next.
3. Connect trip source.
4. Confirm which Google trip/list/map should be used.
5. Enable the manager's live location.
6. Enter the main experience: map, trip points, manager location, and Kodi chat.

Current implementation:

- Kodi opens with a single activation step.
- The trip source step asks for the real trip name, Google Maps viewing link, manager name, and manager age while clearly avoiding a live-sync claim.
- The first-run flow has no bypass button into the main app. The user must complete the real account/trip setup path before entering the map and chat.
- Manager GPS is an explicit step before entering the core experience.
- The main app opens only after the core is ready: Kodi, map, trip points, and manager location.

Only after the core is running should the app offer:

- adding participants
- group location sharing
- admin permissions
- external app shortcuts
- usage/billing visibility
- Booking, Airbnb, Waze, and other outbound links

## Participant Invitation Flow

After the trip manager completes the core setup, the next natural action is inviting the rest of the group.

This should feel similar to joining a WhatsApp group:

1. The manager opens the group/invite action after the main map is active.
2. The app creates a simple trip invite link.
3. The manager sends that link through WhatsApp, SMS, email, or any other app.
4. A participant opens the link on their phone.
5. The participant sees a join screen, not the manager setup flow.
6. The participant enters name and age or age group.
7. The participant joins the shared Kodi conversation.
8. Location sharing is requested separately and only on that participant's device.

The manager remains responsible for operational changes unless the group permissions are changed.

Participants can talk in the family conversation, ask Kodi questions, approve their own location sharing, and see the shared map and trip points.

Participants should not receive provider secrets, Google keys, OpenAI keys, Supabase service-role keys, or owner billing access.

## Google Source Clarity

Pasting a Google Maps viewing link must not pretend to perform live sync.

If the app cannot read the user's Google account yet, Kodi should say that clearly:

- link recognized
- live Google account sync is not active yet
- OAuth/account connection is required for choosing a real Google Maps trip such as "North Greece"
- the user continues with a real trip account flow, not a separate trial mode

When OAuth is implemented, Kodi should ask:

```text
I found these Google Maps lists/maps. Which trip should I sync?
```

Then the user selects the real trip source, such as "טיול צפון יוון".

## Main Screen

The main screen should prioritize:

- map first
- trip points visible on the map
- manager live location visible on the map after consent
- Kodi available in the same family conversation
- one obvious next action

The hamburger or secondary management area can contain:

- add participants
- location permissions
- Google connection
- Waze / Booking / Airbnb shortcuts
- admin settings
- usage controls
- help and connection status

The hamburger is for management. It is not the heart of the trip experience.

## Product Gate

Before adding more features, ask:

```text
Does this make Kodi + map + trip points + manager location clearer?
```

If not, it belongs later or in the management menu.
