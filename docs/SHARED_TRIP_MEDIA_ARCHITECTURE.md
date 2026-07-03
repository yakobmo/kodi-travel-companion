# Shared Trip Media Architecture

## Product Intent

Kodi should support a shared trip photo space for the group.

The feature is not a separate social network. It is part of the trip companion:

- Participants can take or upload photos from the app.
- Photos are saved into the shared trip space.
- All approved group members can view the trip gallery.
- Kodi can later use the photos as trip memory and context.

Hebrew product example:

```text
עומרי מצלם דרך האפליקציה.
התמונה נשמרת בתמונות הטיול של צפון יוון.
כולם בקבוצה יכולים לראות אותה.
קודי יודע מי צילם, מתי, ואיפה בערך זה היה.
```

## UX Principle

The first version must be simple:

1. A clear `מצלמה` or `הוסף תמונה` action.
2. The phone opens camera/file picker through the browser.
3. The user confirms upload.
4. The photo appears in `תמונות הטיול`.

This should not crowd the primary screen. The product heart remains:

```text
Kodi + Google Maps + trip points + group chat + live location
```

The media entry point should live in the hamburger/menu first, with a small future shortcut only if user testing shows it is important during the trip.

## Permission Model

The trip owner/admin owns the shared trip space.

Participants do not need Render, Supabase, Google, or OpenAI credentials.

Participant permissions:

- Any joined member may upload photos by default.
- Owner/admin may delete any photo.
- A member may delete their own uploaded photo.
- Future admin setting can disable member uploads if needed.

Device permissions:

- Camera permission is requested only when the user chooses to take a photo.
- Photo-library/file permission is requested only when the user chooses to upload.
- Location metadata is attached only if the user already approved live location or explicitly allows photo location.

## Data Architecture

Use Supabase Storage for binary photo files.

Use PostgreSQL tables for photo metadata.

Planned storage bucket:

```text
trip-media
```

Recommended object path:

```text
trip-groups/{tripGroupId}/photos/{photoId}.{extension}
```

Recommended metadata table:

```text
trip_photos
```

Recommended fields:

- `id`
- `trip_group_id`
- `uploaded_by_member_id`
- `storage_bucket`
- `storage_path`
- `caption`
- `captured_at`
- `uploaded_at`
- `latitude`
- `longitude`
- `nearest_place_id`
- `nearest_place_name`
- `mime_type`
- `file_size_bytes`
- `width`
- `height`
- `deleted_at`

The database stores only metadata and storage paths. The image file itself lives in Supabase Storage.

## Privacy And Safety

The default should be group-private.

Rules:

- No public photo URLs by default.
- Backend creates short-lived signed URLs for viewing.
- Service-role keys stay backend-only.
- Do not expose raw Supabase storage credentials to the browser.
- Avoid storing full location history through photos unless the user has consented.
- Strip or ignore unsafe EXIF metadata unless a later product decision explicitly needs it.

## Kodi Agent Behavior

Kodi should eventually understand the shared gallery as part of the trip context.

Allowed future requests:

- "קודי, תראה לי תמונות מהיום בפיליון."
- "קודי, מי צילם את התמונה ליד הגשר?"
- "קודי, צור לנו סיכום יום עם התמונות."
- "קודי, תמצא תמונות שצולמו ליד מפלים."

Kodi may use:

- uploader name
- timestamp
- approved location metadata
- nearest trip point
- caption

Kodi must not claim to see a private photo unless the backend confirms the user has access to it.

## Implementation Stages

### V1 - Shared Upload And Gallery

- Add Supabase Storage bucket.
- Add `trip_photos` metadata table.
- Add backend upload endpoint.
- Add backend signed-view endpoint.
- Add gallery view in the hamburger/menu.
- Add camera/file input from the app.
- Save uploader, time, and optional location.

### V2 - Trip Context

- Attach nearest trip point automatically.
- Add captions/notes.
- Add filter by day, region, uploader, and nearby place.
- Let Kodi answer photo-related questions from metadata.

### V3 - Smart Trip Memory

- Kodi creates daily summaries and albums.
- Kodi can suggest "best photos of today".
- Optional face/object/image understanding only after explicit privacy review.
- Optional export/share album.

## Current Decision

Add this to the product architecture now.

Do not implement the full camera/storage flow until the current map/chat/Kodi core is stable enough for family testing.

