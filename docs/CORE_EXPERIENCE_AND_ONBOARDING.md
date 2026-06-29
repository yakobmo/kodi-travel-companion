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

Only after the core is running should the app offer:

- adding participants
- group location sharing
- admin permissions
- external app shortcuts
- usage/billing visibility
- Booking, Airbnb, Waze, and other outbound links

## Google Source Clarity

Pasting a Google Maps viewing link must not pretend to perform live sync.

If the app cannot read the user's Google account yet, Kodi should say that clearly:

- link recognized
- live Google account sync is not active yet
- OAuth/account connection is required for choosing a real Google Maps trip such as "North Greece"
- demo mode can continue with already imported fixture data

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
