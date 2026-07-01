# Core Experience And Onboarding

## Product Heart

Kodi Travel Companion is built around one core experience:

```text
Kodi + live map + trip points + at least the trip manager's live location
```

This is the heart of the app.

The map engine is Google Maps. Kodi must not recreate Google Maps behavior such as map movement, zoom gestures, compass, follow-location, walking guidance, or native route/map interaction. Kodi's unique layer is the trip agent: conversation, group context, imported trip points, recommendations, admin approvals, and opening the selected point in Waze or Google Maps. Walking navigation should open Google Maps in walking mode so the user gets Google's compass, turn-by-turn walking UI, and familiar map controls.

Implementation rule: browser map rendering must use Google Maps JavaScript API when a browser-safe key is configured through `GOOGLE_MAPS_BROWSER_API_KEY` or `VITE_GOOGLE_MAPS_API_KEY`. `GOOGLE_MAPS_API_KEY` is server-side for Places/Routes and is not exposed to browsers unless explicitly allowed by `GOOGLE_MAPS_ALLOW_SERVER_KEY_IN_BROWSER=true` during controlled testing. The internal map drawing layer is a development fallback only, not the product map.

Product framing rule: the user experience is "Kodi inside Google Maps context", not "Kodi built its own map". Location, movement, zoom, compass, map gestures, and route-like map behavior should feel like the normal Google Maps experience. Kodi should add the conversation and decision layer on top of Google Maps, not compete with Google Maps.

Kodi's agent role includes editing the trip plan. In the product UX, the user should be able to say things like "Kodi, add this beach", "move the next stop", "replace this restaurant", or "add the viewpoint you found". The first supported implementation is editing the Kodi trip layer shown on Google Maps, not silently editing the user's private Google Maps/My Maps account. Direct Google write-back is a later OAuth/API-gated capability and must be explicitly verified before the UI claims it happened.

Without the manager's live location, Kodi cannot reliably answer "what now?", "what is nearby?", "how long to the hotel?", or "open this in Waze" in a travel-specific way.

Group member locations are a flagship extension, but the minimum viable live context is:

- the trip manager's consented live location
- the imported trip places and lodging points
- Kodi's chat context
- the active day/route/lodging context when available

Live location is conceptually part of the Google Maps experience. In the web app, the browser still requires device/location permission before any app can use the user's current location; Kodi cannot silently inherit the private live location from the user's Google Maps app or Google account. After consent, the app should show and update the manager/member marker on Google Maps, use Google Maps as the visible map surface, and sync the latest approved location to the backend with consent-aware visibility.

UX wording should avoid suggesting that Kodi has a separate GPS system. Prefer language such as "Google Maps location is active" or "live location on the map" over infrastructure wording.

## Kodi Voice Personality

Kodi's voice is part of the product personality. When Kodi reads guidance aloud, the experience should feel like a warm, capable travel partner, not a technical robot.

Voice behavior:

- The target experience is a natural GPT-style voice: friendly, present, warm, and fluent in Hebrew.
- Use server-side natural OpenAI/GPT speech for Kodi audio when `OPENAI_API_KEY` is configured.
- Do not fake personality by forcing slow, low, or overly styled voice settings.
- The default server voice should stay close to OpenAI's neutral/default TTS behavior: `gpt-4o-mini-tts`, `alloy`, speed `1.0`, and no custom style instructions unless explicitly configured.
- Browser speech synthesis is only a fallback when server speech is unavailable; the fallback should use natural/default rate and pitch instead of trying to imitate a custom persona.
- The server voice model, voice, and optional instructions should be configurable through environment variables so the product can tune Kodi's voice without exposing secrets to participants.

## Here-And-Now Mode

Kodi must also support a live "here and now" mode outside the planned itinerary.

The user may be in Be'er Sheva, at home, on a spontaneous day trip, or anywhere else, and ask Kodi to work from the current location instead of the saved Greece route.

Examples:

- "Kodi, what is good near me now?"
- "Kodi, find a playground around here."
- "Kodi, I am in Be'er Sheva, where should we eat?"
- "Kodi, leave the planned route for a moment and help me with what is around us."

Product rule:

When the user's wording points to here/near me/current location/here-and-now, the live/current location takes precedence over the planned trip timeline. The saved trip remains background context, but it must not drag the answer back to a hotel, region, or attraction from the planned route. A generic "what should we do now?" does not leave the planned trip by itself.

Kodi should be able to switch back naturally when the user refers again to the planned trip, for example "tomorrow in Pelion" or "the hotel in Zagori".

## Response Speed Principle

Kodi should feel conversational and quick. Not every message should wait for the full AI reasoning path.

For simple trip-context questions such as "where do we sleep tonight and what taverna is near the hotel?", the backend should answer through a fast lane:

- resolve the current/future lodging from the trip timeline, active route, or group destination
- prefer nearby food/attraction points already saved in the Google trip map
- use Google Places only when the user really needs a live external lookup
- skip the full OpenAI agent when the answer is already clear
- reuse a very short server-side trip-state snapshot during active chat bursts
- return latency metadata so QA can catch slow regressions

The full AI agent remains the right path for open-ended reasoning, research, explanations, ambiguity, planning, and questions that require synthesizing many sources.

The full AI agent must still have a server-side time budget. The default target is about 12 seconds through `OPENAI_AGENT_TIMEOUT_MS`; if the full model or live web-search path is too slow, Kodi should return the grounded rules/trip fallback instead of making the group wait 45-60 seconds.

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
5. Enable live location on the Google Maps view when the device/browser asks for permission.
6. Enter the main experience: map, trip points, manager location, and Kodi chat.

Current implementation:

- Kodi opens with a single activation step.
- The trip source step asks for the real trip name, Google Maps viewing link, manager name, and manager age while clearly avoiding a live-sync claim.
- The first-run flow has no bypass button into the main app. The user must complete the real account/trip setup path before entering the map and chat.
- Manager live location is an explicit step before entering the core experience, but it should be framed as enabling location on the Google Maps view, not as a separate Kodi navigation engine.
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
3. The manager taps a clear share action that opens the phone's native share sheet.
4. The manager sends that link through WhatsApp, SMS, email, or any other app.
5. A participant opens the link on their phone.
6. The participant sees a join screen, not the manager setup flow.
7. The participant enters a name and optionally age or age group.
8. The participant joins the shared Kodi conversation.
9. Location sharing is requested separately and only on that participant's device.

WhatsApp is the UX model and a sharing channel, not the product source of truth. Kodi's app remains the place that owns the trip group, map state, permissions, agent context, and operational actions.

For the web MVP, do not import phone contacts or require a WhatsApp Business integration. Use Web Share first, with copy-link fallback. Native contact picking, WhatsApp deep integration, and richer invitation management can be later versions after the core trip/account model is stable.

Legacy fallback sequence:

1. The app creates a simple trip invite link.
2. The manager copies that link.
3. The manager sends it through any communication app.
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

- Google Maps first
- trip points visible on the map
- manager live location visible on Google Maps after device/browser consent
- Kodi available in the same family conversation
- one obvious next action

Default mobile map focus after manager GPS is active: Google Maps should be centered around the manager and show nearby trip points, targeting a 40 km context radius. If there are no trip points inside that radius, Kodi can prioritize the nearest trip points, but the map interaction itself remains Google Maps. The chat is the main working surface on mobile, so the map should be a compact live context panel rather than taking half the screen.

When the user needs the full native Google Maps experience, the main map surface must expose a clear "Open Google Maps" handoff instead of hiding that action in the hamburger menu.

The main screen should not preload invented family dialogue, sample questions, or dense explanatory copy. If no one has written yet, the chat starts clean with a short empty state.

The onboarding state must be scoped to the user's browser/session until real authentication exists. A global demo/setup flag from the backend must not make a new user skip directly into the trip map.

Seeded demo participant names must not appear in the product UI. The visible group starts with the trip manager and Kodi; additional participants are added through the invite flow.

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
