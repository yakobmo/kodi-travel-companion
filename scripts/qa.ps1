$ErrorActionPreference = "Stop"

Write-Host "Running AI Travel Companion skeleton QA..."

$root = Split-Path -Parent $PSScriptRoot
$requiredFiles = @(
  "package.json",
  ".env.example",
  "README.md",
  "DEVELOPMENT_WORKFLOW.md",
  "supabase/schema.sql",
  "supabase/event-log-migration.sql",
  "docs/SUPABASE_SCHEMA.md",
  "docs/GOOGLE_INTEGRATION_PLAN.md",
  "docs/CORE_EXPERIENCE_AND_ONBOARDING.md",
  "docs/TRIP_OWNERSHIP_AND_USAGE_MODEL.md",
  "docs/SHARED_TRIP_MEDIA_ARCHITECTURE.md",
  "docs/CHAT_PUSH_NOTIFICATIONS_ARCHITECTURE.md",
  "scripts/apply-supabase-schema.mjs",
  "scripts/apply-supabase-schema.ps1",
  "scripts/apply-supabase-grants.mjs",
  "scripts/apply-supabase-grants.ps1",
  "scripts/dev-api.ps1",
  "scripts/dev-web.ps1",
  "scripts/smoke-google-places-live.mjs",
  "scripts/smoke-google-routes-live.mjs",
  "scripts/smoke-local.mjs",
  "apps/api/package.json",
  "apps/api/tsconfig.json",
  "apps/api/src/server.ts",
  "apps/api/src/agent/kodi.ts",
  "apps/api/src/agent/openaiAgent.ts",
  "apps/api/src/agent/openaiSpeech.ts",
  "apps/api/src/agent/tripContextResolver.ts",
  "apps/api/src/agent/tripTimelineResolver.ts",
  "apps/api/src/billing/tripUsagePool.ts",
  "apps/api/src/domain/types.ts",
  "apps/api/src/data/demoStorage.ts",
  "apps/api/src/data/supabaseStatus.ts",
  "apps/api/src/data/supabaseMigrationAdmin.ts",
  "apps/api/src/data/localMessages.ts",
  "apps/api/src/data/localEvents.ts",
  "apps/api/src/data/localMembers.ts",
  "apps/api/src/data/localPlaces.ts",
  "apps/api/src/data/localSetupState.ts",
  "apps/api/src/data/localTripState.ts",
  "apps/api/src/google/placesSearch.ts",
  "apps/api/src/google/reverseGeocode.ts",
  "apps/api/src/google/routes.ts",
  "apps/api/src/google/sourceAdapter.ts",
  "apps/api/src/permissions/agentActions.ts",
  "apps/web/package.json",
  "apps/web/tsconfig.json",
  "apps/web/index.html",
  "apps/web/public/manifest.webmanifest",
  "apps/web/public/sw.js",
  "apps/web/public/kodi-icon.svg",
  "apps/web/public/icons/kodi-192.png",
  "apps/web/public/icons/kodi-512.png",
  "apps/web/src/vite-env.d.ts",
  "apps/web/src/demoTrip.ts",
  "apps/web/src/App.tsx",
  "apps/web/src/main.tsx",
  "apps/web/src/styles.css"
)

foreach ($file in $requiredFiles) {
  $path = Join-Path $root $file
  if (-not (Test-Path $path)) {
    throw "Missing required file: $file"
  }
}

$jsonFiles = @(
  "package.json",
  "apps/api/package.json",
  "apps/api/tsconfig.json",
  "apps/web/package.json",
  "apps/web/tsconfig.json"
)

foreach ($file in $jsonFiles) {
  $path = Join-Path $root $file
  Get-Content $path -Raw | ConvertFrom-Json | Out-Null
}

$packageSource = Get-Content (Join-Path $root "package.json") -Raw
if (-not $packageSource.Contains("icons:pwa")) {
  throw "Root package.json must expose the PWA icon generation script."
}

if (-not $packageSource.Contains("smoke:google-places-live")) {
  throw "Root package.json must expose the live Google Places smoke script."
}

if (-not $packageSource.Contains("smoke:google-routes-live")) {
  throw "Root package.json must expose the live Google Routes smoke script."
}

$sharedMediaSource = Get-Content (Join-Path $root "docs\SHARED_TRIP_MEDIA_ARCHITECTURE.md") -Raw -Encoding UTF8
$sharedMediaCoreSource = Get-Content (Join-Path $root "docs\CORE_EXPERIENCE_AND_ONBOARDING.md") -Raw -Encoding UTF8
$sharedMediaSupabaseSource = Get-Content (Join-Path $root "docs\SUPABASE_SCHEMA.md") -Raw -Encoding UTF8
$sharedMediaDeploymentSource = Get-Content (Join-Path $root "docs\DEPLOYMENT_PLAN.md") -Raw -Encoding UTF8
$sharedMediaLinksSource = Get-Content (Join-Path $root "docs\ARCHITECTURE_LINKS.md") -Raw -Encoding UTF8
if (
  -not $sharedMediaSource.Contains("Supabase Storage") -or
  -not $sharedMediaSource.Contains("trip-media") -or
  -not $sharedMediaSource.Contains("trip_photos") -or
  -not $sharedMediaSource.Contains("short-lived signed URLs") -or
  -not $sharedMediaSource.Contains("V1 - Shared Upload And Gallery") -or
  -not $sharedMediaSource.Contains("V2 - Trip Context") -or
  -not $sharedMediaSource.Contains("V3 - Smart Trip Memory") -or
  -not $sharedMediaCoreSource.Contains("Shared Trip Photos") -or
  -not $sharedMediaSupabaseSource.Contains("Planned Media Storage Extension") -or
  -not $sharedMediaDeploymentSource.Contains("Supabase Storage bucket for shared trip photos") -or
  -not $sharedMediaLinksSource.Contains("docs/SHARED_TRIP_MEDIA_ARCHITECTURE.md")
) {
  throw "Shared trip media must be documented across product UX, Supabase storage architecture, deployment, and architecture links before implementation."
}

$pushNotificationsSource = Get-Content (Join-Path $root "docs\CHAT_PUSH_NOTIFICATIONS_ARCHITECTURE.md") -Raw -Encoding UTF8
$pushNotificationsCoreSource = Get-Content (Join-Path $root "docs\CORE_EXPERIENCE_AND_ONBOARDING.md") -Raw -Encoding UTF8
$pushNotificationsSupabaseSource = Get-Content (Join-Path $root "docs\SUPABASE_SCHEMA.md") -Raw -Encoding UTF8
$pushNotificationsDeploymentSource = Get-Content (Join-Path $root "docs\DEPLOYMENT_PLAN.md") -Raw -Encoding UTF8
$pushNotificationsLinksSource = Get-Content (Join-Path $root "docs\ARCHITECTURE_LINKS.md") -Raw -Encoding UTF8
if (
  -not $pushNotificationsSource.Contains("Web Push") -or
  -not $pushNotificationsSource.Contains("Service Worker") -or
  -not $pushNotificationsSource.Contains("Push API") -or
  -not $pushNotificationsSource.Contains("push_subscriptions") -or
  -not $pushNotificationsSource.Contains("notification_preferences") -or
  -not $pushNotificationsSource.Contains("notification_deliveries") -or
  -not $pushNotificationsSource.Contains("VAPID_PRIVATE_KEY") -or
  -not $pushNotificationsSource.Contains("exclude the sender") -or
  -not $pushNotificationsSource.Contains("V2 - Web Push MVP") -or
  -not $pushNotificationsCoreSource.Contains("Message Notifications") -or
  -not $pushNotificationsSupabaseSource.Contains("Planned Push Notification Extension") -or
  -not $pushNotificationsDeploymentSource.Contains("Web Push / VAPID keys") -or
  -not $pushNotificationsLinksSource.Contains("docs/CHAT_PUSH_NOTIFICATIONS_ARCHITECTURE.md")
) {
  throw "Chat push notifications must be documented across product UX, Web Push architecture, Supabase tables, deployment, and architecture links before implementation."
}

$pushSchemaSource = Get-Content (Join-Path $root "supabase\schema.sql") -Raw -Encoding UTF8
if (
  -not $pushSchemaSource.Contains("create table if not exists public.push_subscriptions") -or
  -not $pushSchemaSource.Contains("create table if not exists public.notification_preferences") -or
  -not $pushSchemaSource.Contains("create table if not exists public.notification_deliveries") -or
  -not $pushSchemaSource.Contains("alter table public.push_subscriptions enable row level security") -or
  -not $pushSchemaSource.Contains("'notification_enabled'") -or
  -not $pushSchemaSource.Contains("push_subscriptions_member_idx") -or
  -not $pushSchemaSource.Contains("notification_deliveries_trip_created_idx")
) {
  throw "Supabase schema must include the planned push notification subscription, preference, and delivery tables with RLS."
}

$webIndexSource = Get-Content (Join-Path $root "apps\web\index.html") -Raw
$webManifestSource = Get-Content (Join-Path $root "apps\web\public\manifest.webmanifest") -Raw
$webMainSource = Get-Content (Join-Path $root "apps\web\src\main.tsx") -Raw
$webServiceWorkerSource = Get-Content (Join-Path $root "apps\web\public\sw.js") -Raw
if (
  -not $webIndexSource.Contains('rel="manifest"') -or
  -not $webIndexSource.Contains('apple-touch-icon') -or
  -not $webIndexSource.Contains('theme-color') -or
  -not $webManifestSource.Contains('"short_name"') -or
  -not $webManifestSource.Contains('"display": "standalone"') -or
  -not $webManifestSource.Contains('"purpose": "any maskable"') -or
  -not $webMainSource.Contains('navigator.serviceWorker') -or
  -not $webMainSource.Contains('register("/sw.js")') -or
  -not $webMainSource.Contains("registration.update()") -or
  -not $webMainSource.Contains("controllerchange") -or
  -not $webMainSource.Contains("import.meta.env.PROD") -or
  -not $webServiceWorkerSource.Contains("CACHE_NAME") -or
  -not $webServiceWorkerSource.Contains("fetch") -or
  -not $webServiceWorkerSource.Contains("push") -or
  -not $webServiceWorkerSource.Contains("showNotification") -or
  -not $webServiceWorkerSource.Contains("notificationclick") -or
  -not $webServiceWorkerSource.Contains('request.mode === "navigate"') -or
  -not $webServiceWorkerSource.Contains("text/html") -or
  $webServiceWorkerSource.Contains('const APP_SHELL = ["/"')
) {
  throw "Web app must expose a production PWA install path with manifest, icons, and service worker."
}

$webAppEarlySource = Get-Content (Join-Path $root "apps\web\src\App.tsx") -Raw
if (
  -not $webAppEarlySource.Contains("beforeinstallprompt") -or
  -not $webAppEarlySource.Contains("installKodiShortcut") -or
  -not $webAppEarlySource.Contains("install-menu") -or
  -not $webAppEarlySource.Contains("Download size={18}") -or
  -not $webAppEarlySource.Contains('installState === "installed"')
) {
  throw "Web app must expose a clear in-app install shortcut for adding Kodi to the phone home screen."
}

$ownershipModelSource = Get-Content (Join-Path $root "docs\TRIP_OWNERSHIP_AND_USAGE_MODEL.md") -Raw
if (
  -not $ownershipModelSource.Contains("shared trip-space agent") -or
  -not $ownershipModelSource.Contains("Trip Owner") -or
  -not $ownershipModelSource.Contains("Usage Pool") -or
  -not $ownershipModelSource.Contains("Participants do not bring separate OpenAI keys") -or
  -not $ownershipModelSource.Contains("private credentials stay on the server side") -or
  -not $ownershipModelSource.Contains("Stage 1 - Working Prototype") -or
  -not $ownershipModelSource.Contains("Stage 2 - Multi-Trip Product") -or
  -not $ownershipModelSource.Contains("Stage 3 - Scale-Ready Service") -or
  -not $ownershipModelSource.Contains("users never manage Render or provider credentials")
) {
  throw "Trip ownership and usage model must document one owner-managed usage pool and backend-only provider secrets."
}

$coreExperienceSource = Get-Content (Join-Path $root "docs\CORE_EXPERIENCE_AND_ONBOARDING.md") -Raw
if (
  -not $coreExperienceSource.Contains("Kodi + live map + trip points + at least the trip manager's live location") -or
  -not $coreExperienceSource.Contains("one clear next action") -or
  -not $coreExperienceSource.Contains("manager's live location") -or
  -not $coreExperienceSource.Contains("Kodi's agent role includes editing the trip plan") -or
  -not $coreExperienceSource.Contains("editing the Kodi trip layer shown on Google Maps") -or
  -not $coreExperienceSource.Contains("Direct Google write-back is a later OAuth/API-gated capability") -or
  -not $coreExperienceSource.Contains("Here-And-Now Mode") -or
  -not $coreExperienceSource.Contains("live/current location takes precedence over the planned trip timeline") -or
  -not $coreExperienceSource.Contains("hamburger") -or
  -not $coreExperienceSource.Contains("Google account sync is not active yet") -or
  -not $coreExperienceSource.Contains("Participant Invitation Flow") -or
  -not $coreExperienceSource.Contains("joining a WhatsApp group") -or
  -not $coreExperienceSource.Contains("Location sharing is requested separately")
) {
  throw "Core experience doc must define Kodi + map + trip points + manager location, with one clear onboarding action at a time."
}

$googleIntegrationSource = Get-Content (Join-Path $root "docs\GOOGLE_INTEGRATION_PLAN.md") -Raw
if (
  -not $googleIntegrationSource.Contains("Kodi As The Google Maps Agent") -or
  -not $googleIntegrationSource.Contains("Kodi can edit the **Kodi trip layer** first") -or
  -not $googleIntegrationSource.Contains("If Google does not provide a supported write API") -or
  -not $googleIntegrationSource.Contains("owner/admin approves") -or
  -not $googleIntegrationSource.Contains("Future Google write-back model") -or
  -not $googleIntegrationSource.Contains("Here-and-now requests must prefer the live/current location")
) {
  throw "Google integration plan must define Kodi as the map agent while keeping Google write-back gated by OAuth and supported APIs."
}

$tripUsagePoolSource = Get-Content (Join-Path $root "apps\api\src\billing\tripUsagePool.ts") -Raw
if (
  -not $tripUsagePoolSource.Contains("buildDemoTripUsagePool") -or
  -not $tripUsagePoolSource.Contains("buildTripUsageAuditSummary") -or
  -not $tripUsagePoolSource.Contains("authorizeTripUsageCapability") -or
  -not $tripUsagePoolSource.Contains("usage_pool_authorized") -or
  -not $tripUsagePoolSource.Contains("participantBillingRequired: false") -or
  -not $tripUsagePoolSource.Contains("providerSecretsStoredServerSide: true") -or
  -not $tripUsagePoolSource.Contains("browserReceivesPrivateKeys: false") -or
  -not $tripUsagePoolSource.Contains("chargedTo: `"trip_usage_pool`"") -or
  -not $tripUsagePoolSource.Contains("quotaEnforcedServerSide: true") -or
  -not $tripUsagePoolSource.Contains("openai_agent: Boolean(process.env.OPENAI_API_KEY)")
) {
  throw "Trip usage pool code must enforce owner-managed billing, backend mediation, and no participant secrets."
}

$openAiAgentSource = Get-Content (Join-Path $root "apps\api\src\agent\openaiAgent.ts") -Raw
if (
  -not $openAiAgentSource.Contains("OpenAI") -or
  -not $openAiAgentSource.Contains("OPENAI_API_KEY") -or
  -not $openAiAgentSource.Contains("OPENAI_AGENT_MODEL") -or
  -not $openAiAgentSource.Contains("OPENAI_AGENT_FAST_MODEL") -or
  -not $openAiAgentSource.Contains("OPENAI_AGENT_REASONING_MODEL") -or
  -not $openAiAgentSource.Contains("OPENAI_AGENT_TIMEOUT_MS") -or
  -not $openAiAgentSource.Contains("openai_agent_timeout") -or
  -not $openAiAgentSource.Contains("withAgentTimeout") -or
  -not $openAiAgentSource.Contains("shouldUseReasoningModel") -or
  -not $openAiAgentSource.Contains("fallbackRulesReply") -or
  -not $openAiAgentSource.Contains("Google Maps is the map engine") -or
  -not $openAiAgentSource.Contains("route map, route diagram, trip sketch") -or
  -not $openAiAgentSource.Contains("elite Hebrew AI travel companion") -or
  -not $openAiAgentSource.Contains("web_search") -or
  -not $openAiAgentSource.Contains("shouldEnableWebSearch") -or
  -not $openAiAgentSource.Contains("web_search_retry_without_tool") -or
  -not $openAiAgentSource.Contains("lodgingTimeline") -or
  -not $openAiAgentSource.Contains("tripArcHint") -or
  -not $openAiAgentSource.Contains("cash planning") -or
  -not $openAiAgentSource.Contains("road accessibility") -or
  -not $openAiAgentSource.Contains("Support a here-and-now mode") -or
  -not $openAiAgentSource.Contains("reverseGeocodedLocation") -or
  -not $openAiAgentSource.Contains("Do not claim live Google account sync") -or
  -not $openAiAgentSource.Contains("Return JSON only") -or
  -not $openAiAgentSource.Contains('source: "openai"')
) {
  throw "OpenAI agent bridge must be backend-only, elite-agent grounded in Google/trip context, web-search capable for live questions, JSON validated, time-budgeted, and guarded by a fallback."
}

$openAiSpeechSource = Get-Content (Join-Path $root "apps\api\src\agent\openaiSpeech.ts") -Raw
if (
  -not $openAiSpeechSource.Contains("client.audio.speech.create") -or
  -not $openAiSpeechSource.Contains("gpt-4o-mini-tts") -or
  -not $openAiSpeechSource.Contains("OPENAI_TTS_VOICE") -or
  -not $openAiSpeechSource.Contains('"echo"') -or
  -not $openAiSpeechSource.Contains("OPENAI_TTS_INSTRUCTIONS") -or
  -not $openAiSpeechSource.Contains("adult male Israeli guide voice") -or
  -not $openAiSpeechSource.Contains("OPENAI_TTS_SPEED") -or
  -not $openAiSpeechSource.Contains("return 1.16") -or
  -not $openAiSpeechSource.Contains("response_format: `"mp3`"")
) {
  throw "OpenAI speech bridge must use the OpenAI-style default voice path, configurable model/voice/speed, and the faster Kodi default speech pace."
}

$serverSource = Get-Content (Join-Path $root "apps\api\src\server.ts") -Raw -Encoding UTF8
if (
  -not $serverSource.Contains("shouldUseHereAndNowContext") -or
  -not $serverSource.Contains("getRequestCurrentLocation") -or
  -not $serverSource.Contains("withRequestCurrentLocation") -or
  -not $serverSource.Contains('item.member.role === "owner"') -or
  -not $serverSource.Contains('first.liveLocation?.source === "gps"') -or
  -not $serverSource.Contains("new Date(second.liveLocation?.updatedAt") -or
  -not $serverSource.Contains("shouldReverseGeocodeCurrentLocation") -or
  -not $serverSource.Contains("reverseGeocodeLocation") -or
  -not $serverSource.Contains("forceLiveLocation") -or
  -not $serverSource.Contains("Here-and-now request: live/current location takes precedence")
) {
  throw "Agent server flow must support here-and-now mode by preferring request live location over the planned timeline."
}

if ($serverSource.Contains("!shouldReverseGeocodeCurrentLocation(message) && openAiUsageGate.allowed")) {
  throw "Current-location questions must reach the OpenAI agent after reverse geocoding; do not force them into rules-only replies."
}

$reverseGeocodeSource = Get-Content (Join-Path $root "apps\api\src\google\reverseGeocode.ts") -Raw
$kodiSourceEarly = Get-Content (Join-Path $root "apps\api\src\agent\kodi.ts") -Raw -Encoding utf8
if (
  -not $kodiSourceEarly.Contains("isTripRouteDiagramRequest") -or
  -not $kodiSourceEarly.Contains("buildTripRouteDiagramAnswer") -or
  -not $kodiSourceEarly.Contains("https://www.google.com/maps/dir/")
) {
  throw "Kodi fallback must build a useful route-map/diagram answer from trip points instead of dodging map-diagram requests."
}

if (
  -not $serverSource.Contains("shouldUseDeterministicRouteDiagram") -or
  -not $serverSource.Contains("!deterministicRouteDiagram")
) {
  throw "Kodi server flow must keep route-map/diagram requests deterministic so OpenAI cannot dodge or overwrite the built map answer."
}

if (
  -not $reverseGeocodeSource.Contains("maps.googleapis.com/maps/api/geocode/json") -or
  -not $reverseGeocodeSource.Contains("latlng") -or
  -not $reverseGeocodeSource.Contains("formattedAddress") -or
  -not $kodiSourceEarly.Contains("buildCurrentLocationAnswer") -or
  -not $kodiSourceEarly.Contains("item.member.id === memberId") -or
  -not $kodiSourceEarly.Contains('externalPlacesSearch?.status !== "ready"') -or
  -not $kodiSourceEarly.Contains("getReverseGeocodedReadableAddress") -or
  -not $kodiSourceEarly.Contains("getNearbyReadablePlace") -or
  -not $kodiSourceEarly.Contains("getDistanceKm(liveLocation, { lat: Number(place.lat), lng: Number(place.lng) })") -or
  -not $kodiSourceEarly.Contains("<= 2") -or
  -not $kodiSourceEarly.Contains("reverseGeocodedLocation")
) {
  throw "Kodi must answer current-location questions from Google reverse geocoding before falling back to raw coordinates."
}

if (
  $kodiSourceEarly.Contains("בקואורדינטות `${visibleMember.liveLocation.lat}") -or
  $kodiSourceEarly.Contains("לא הצלחתי לתרגם אותן לשם מקום")
) {
  throw "Kodi current-location fallback must not expose raw coordinates as the user-facing answer."
}

if ($openAiAgentSource.Contains("dangerouslyAllowBrowser")) {
  throw "OpenAI agent bridge must never allow browser-side OpenAI credentials."
}

$webAppSource = Get-Content (Join-Path $root "apps\web\src\App.tsx") -Raw -Encoding UTF8
if (
  -not $webAppSource.Contains("SpeechRecognition") -or
  -not $webAppSource.Contains("startVoiceInput") -or
  -not $webAppSource.Contains("finishVoiceInput") -or
  -not $webAppSource.Contains("voiceShouldSendRef") -or
  -not $webAppSource.Contains("playChatTone") -or
  -not $webAppSource.Contains('"record-start"') -or
  -not $webAppSource.Contains('"voice-sent"') -or
  -not $webAppSource.Contains("submitChatText(spokenText,") -or
  -not $webAppSource.Contains("voiceConversationActive") -or
  -not $webAppSource.Contains("voice-conversation-toggle") -or
  -not $webAppSource.Contains("scheduleVoiceConversationListening") -or
  -not $webAppSource.Contains('forceKodi: voiceMode === "conversation"') -or
  -not $webAppSource.Contains('speakReply: voiceMode === "conversation"') -or
  -not $webAppSource.Contains("speechRecognitionRef.current.stop()") -or
  -not $webAppSource.Contains("releasePointerCapture") -or
  -not $webAppSource.Contains("onPointerDown") -or
  -not $webAppSource.Contains("onPointerUp") -or
  -not $webAppSource.Contains("voice-button") -or
  -not $webAppSource.Contains("voice-recording-indicator") -or
  -not $webAppSource.Contains("recording-dot") -or
  -not $webAppSource.Contains('role="status"') -or
  -not $webAppSource.Contains('speechState === "listening"') -or
  -not $webAppSource.Contains('speechState === "unsupported"') -or
  -not $webAppSource.Contains("recognition.lang = `"he-IL`"")
) {
  throw "Web chat composer must keep Hebrew voice input available as a clean Kodi interaction path."
}

if (
  -not $webAppSource.Contains("isKodiThinking") -or
  -not $webAppSource.Contains("kodi-thinking-pulse") -or
  -not $webAppSource.Contains("role=`"status`"") -or
  -not $webAppSource.Contains("[messages, isKodiThinking]")
) {
  throw "Web chat must show a live Kodi thinking indicator while waiting for the agent."
}

if (
  -not $webAppSource.Contains("joinTripFromInvite") -or
  -not $webAppSource.Contains("/api/trips/demo/members") -or
  -not $webAppSource.Contains("removeTripMember") -or
  -not $webAppSource.Contains("leaveTripGroup") -or
  -not $webAppSource.Contains("members-menu") -or
  -not $webAppSource.Contains("danger-menu-action") -or
  -not $webAppSource.Contains("trip-map-source-menu") -or
  -not $webAppSource.Contains("requestTripMapSwitch") -or
  -not $webAppSource.Contains("mapSwitchDraft") -or
  -not $webAppSource.Contains("/api/trips/demo/google-source/switch") -or
  -not $webAppSource.Contains("mapSwitchState")
) {
  throw "Web hamburger must support simple invite join, member removal/leave, and trip map source switching."
}

if (
  -not $webAppSource.Contains("/api/trips/demo/notifications/config") -or
  -not $webAppSource.Contains("/api/trips/demo/notifications/subscriptions") -or
  -not $webAppSource.Contains("enableMessageNotifications") -or
  -not $webAppSource.Contains("Notification.requestPermission") -or
  -not $webAppSource.Contains("registration.pushManager.subscribe") -or
  -not $webAppSource.Contains("notifications-menu") -or
  -not $webAppSource.Contains("התראות הודעות")
) {
  throw "Web app must expose an opt-in message notification control backed by browser Push subscription registration."
}

$apiServerSource = Get-Content (Join-Path $root "apps\api\src\server.ts") -Raw -Encoding UTF8
if (
  -not $apiServerSource.Contains("app.post(`"/api/trips/demo/members`"") -or
  -not $apiServerSource.Contains("app.delete(`"/api/trips/demo/members/:memberId`"") -or
  -not $apiServerSource.Contains("addDemoTripMemberAsync") -or
  -not $apiServerSource.Contains("removeDemoTripMemberAsync")
) {
  throw "API must expose server-backed trip member join and leave/remove actions."
}

if (
  -not $apiServerSource.Contains("app.get(`"/api/trips/demo/notifications/config`"") -or
  -not $apiServerSource.Contains("app.post(`"/api/trips/demo/notifications/subscriptions`"") -or
  -not $apiServerSource.Contains("VAPID_PUBLIC_KEY") -or
  -not $apiServerSource.Contains("web_push_not_configured") -or
  -not $apiServerSource.Contains('eventType: "notification_enabled"') -or
  -not $apiServerSource.Contains("isPushSubscriptionPayload") -or
  -not $apiServerSource.Contains("demoPushSubscriptions")
) {
  throw "API must expose guarded Web Push readiness and subscription registration endpoints."
}

if (
  -not $apiServerSource.Contains("buildKodiMemberWelcomeMessage") -or
  -not $apiServerSource.Contains("welcomeMessage") -or
  -not $apiServerSource.Contains("appendDemoTripMessageAsync") -or
  -not $apiServerSource.Contains("source: `"agent`"") -or
  -not $apiServerSource.Contains("ברוך הבא") -or
  -not $webAppSource.Contains("welcomeMessage?: ChatMessage") -or
  -not $webAppSource.Contains("mergeChatMessages(currentMessages, [welcomeMessage])")
) {
  throw "New trip members must receive a server-backed Kodi welcome message in the group chat."
}

if (
  -not $webAppSource.Contains("isCurrentLocationQuestion") -or
  -not $webAppSource.Contains("getFreshCurrentLocationForAgent") -or
  -not $webAppSource.Contains("navigator.geolocation.getCurrentPosition") -or
  -not $webAppSource.Contains("maximumAge: 0") -or
  -not $webAppSource.Contains("agentCurrentLocation")
) {
  throw "Web app must refresh device GPS before asking Kodi current-location questions."
}

if (
  -not $webAppSource.Contains("SpeechSynthesisUtterance") -or
  -not $webAppSource.Contains("speakKodiMessage") -or
  -not $webAppSource.Contains("shouldSpeakKodiReply") -or
  -not $webAppSource.Contains("buildSpeechText") -or
  -not $webAppSource.Contains("getKodiHebrewVoice") -or
  -not $webAppSource.Contains("maleVoiceHints") -or
  -not $webAppSource.Contains("speechOutputState") -or
  -not $webAppSource.Contains("/api/agent/speech") -or
  -not $webAppSource.Contains("new Audio(audioUrl)") -or
  -not $webAppSource.Contains("speechAudioCacheRef") -or
  -not $webAppSource.Contains("prefetchKodiSpeech") -or
  -not $webAppSource.Contains('"preparing"') -or
  -not $webAppSource.Contains("speakKodiMessageWithBrowserVoice") -or
  -not $webAppSource.Contains("speak-message-button") -or
  -not $webAppSource.Contains('utterance.lang = "he-IL"') -or
  -not $webAppSource.Contains("utterance.pitch = 1") -or
  -not $webAppSource.Contains("utterance.rate = 1") -or
  -not $webAppSource.Contains("Volume2") -or
  -not $webAppSource.Contains("VolumeX")
) {
  throw "Web chat must use server-side natural Kodi speech first, with neutral browser speech only as fallback."
}

$webStylesSource = Get-Content (Join-Path $root "apps\web\src\styles.css") -Raw
if (
  -not $webStylesSource.Contains(".composer .voice-button") -or
  -not $webStylesSource.Contains("grid-template-columns: minmax(88px, auto) minmax(0, 1fr) 44px auto") -or
  -not $webStylesSource.Contains(".composer .voice-conversation-toggle") -or
  -not $webStylesSource.Contains("white-space: nowrap") -or
  -not $webStylesSource.Contains(".composer .voice-conversation-toggle span") -or
  $webStylesSource.Contains(".voice-conversation-toggle {`n  grid-column: 1 / -1;") -or
  -not $webStylesSource.Contains(".voice-recording-indicator") -or
  -not $webStylesSource.Contains(".recording-dot") -or
  -not $webStylesSource.Contains("touch-action: none") -or
  -not $webStylesSource.Contains("@keyframes recording-pulse") -or
  -not $webStylesSource.Contains("@keyframes microphone-listening")
) {
  throw "Web composer styles must reserve a stable voice button and a clear recording indicator."
}

if (
  -not $webStylesSource.Contains(".kodi-thinking-pulse") -or
  -not $webStylesSource.Contains("@keyframes kodi-thinking-pulse") -or
  -not $webStylesSource.Contains("#087f9d") -or
  -not $webStylesSource.Contains("#13b8b1")
) {
  throw "Web chat styles must include the Kodi thinking pulse in the app blue/turquoise palette."
}

if (-not $webStylesSource.Contains(".speak-message-button") -or -not $webStylesSource.Contains(".message-header")) {
  throw "Web chat styles must keep Kodi voice output controls compact inside agent messages."
}

$sourcePlacesPath = Join-Path (Split-Path -Parent $root) "work\spikes\google-place-list\out\places.json"
if (-not (Test-Path $sourcePlacesPath)) {
  throw "Missing local places fixture: $sourcePlacesPath"
}

$places = Get-Content $sourcePlacesPath -Raw | ConvertFrom-Json
if ($places.Count -lt 100) {
  throw "Expected at least 100 imported places in local fixture."
}

$localPlacesSource = Get-Content (Join-Path $root "apps\api\src\data\localPlaces.ts") -Raw
if (-not $localPlacesSource.Contains("loadDemoTripPlaces")) {
  throw "Local places loader is missing loadDemoTripPlaces."
}

if (
  -not $localPlacesSource.Contains("loadDemoTripPlaces") -or
  -not $localPlacesSource.Contains("getDemoTripPlacesSourcePath") -or
  $localPlacesSource.Contains("buildDemoGoogleSourcePreview")
) {
  throw "Local places loader must stay focused on places; Google source preview belongs in the adapter boundary."
}

$googleSourceAdapterSource = Get-Content (Join-Path $root "apps\api\src\google\sourceAdapter.ts") -Raw
if (
  -not $googleSourceAdapterSource.Contains("GoogleSourceAdapter") -or
  -not $googleSourceAdapterSource.Contains("fixtureGoogleSourceAdapter") -or
  -not $googleSourceAdapterSource.Contains("googleApiSourceAdapter") -or
  -not $googleSourceAdapterSource.Contains("getActiveGoogleSourceAdapter") -or
  -not $googleSourceAdapterSource.Contains("getGoogleSourceReadiness") -or
  -not $googleSourceAdapterSource.Contains('state: "not_configured"') -or
  -not $googleSourceAdapterSource.Contains("read_only_fixture") -or
  -not $googleSourceAdapterSource.Contains("requiresGoogleOAuthForLiveSync") -or
  -not $googleSourceAdapterSource.Contains("liveGoogleAccess: false") -or
  -not $googleSourceAdapterSource.Contains("canWriteBackToGoogle: false")
) {
  throw "Google source integration must go through a read-only adapter boundary before live Google sync."
}

$googlePlacesSearchSource = Get-Content (Join-Path $root "apps\api\src\google\placesSearch.ts") -Raw
if (
  -not $googlePlacesSearchSource.Contains("https://places.googleapis.com/v1/places:searchText") -or
  -not $googlePlacesSearchSource.Contains("X-Goog-Api-Key") -or
  -not $googlePlacesSearchSource.Contains("X-Goog-FieldMask") -or
  -not $googlePlacesSearchSource.Contains("GOOGLE_MAPS_API_KEY") -or
  -not $googlePlacesSearchSource.Contains("google_maps_api_key_required") -or
  -not $googlePlacesSearchSource.Contains("not_configured") -or
  -not $googlePlacesSearchSource.Contains("places.displayName") -or
  -not $googlePlacesSearchSource.Contains("places.formattedAddress") -or
  -not $googlePlacesSearchSource.Contains("places.googleMapsUri")
) {
  throw "Google Places Text Search must be implemented as a guarded server-side read path with explicit field masks."
}

if ($googlePlacesSearchSource.Contains('X-Goog-FieldMask": "*"') -or $googlePlacesSearchSource.Contains("X-Goog-FieldMask': '*'")) {
  throw "Google Places Text Search must not use wildcard field masks in production code."
}

$googleRoutesSource = Get-Content (Join-Path $root "apps\api\src\google\routes.ts") -Raw
if (
  -not $googleRoutesSource.Contains("https://routes.googleapis.com/directions/v2:computeRoutes") -or
  -not $googleRoutesSource.Contains("X-Goog-Api-Key") -or
  -not $googleRoutesSource.Contains("X-Goog-FieldMask") -or
  -not $googleRoutesSource.Contains("routes.duration,routes.distanceMeters") -or
  -not $googleRoutesSource.Contains("GOOGLE_MAPS_API_KEY") -or
  -not $googleRoutesSource.Contains("google_maps_api_key_required") -or
  -not $googleRoutesSource.Contains("not_configured")
) {
  throw "Google Routes must be implemented as a guarded server-side read path with a narrow field mask."
}

if ($googleRoutesSource.Contains('X-Goog-FieldMask": "*"') -or $googleRoutesSource.Contains("X-Goog-FieldMask': '*'")) {
  throw "Google Routes must not use wildcard field masks in production code."
}

$googlePlacesLiveSmokeSource = Get-Content (Join-Path $root "scripts\smoke-google-places-live.mjs") -Raw
if (
  -not $googlePlacesLiveSmokeSource.Contains("GOOGLE_MAPS_API_KEY configured") -or
  -not $googlePlacesLiveSmokeSource.Contains("/api/google/places/text-search") -or
  -not $googlePlacesLiveSmokeSource.Contains("/api/agent/message") -or
  -not $googlePlacesLiveSmokeSource.Contains("externalPlacesSearchStatus") -or
  -not $googlePlacesLiveSmokeSource.Contains("places.payload.apiKey === undefined")
) {
  throw "Live Google Places smoke must verify readiness, endpoint results, Kodi agent context, and no API key leakage."
}

$tripContextResolverSource = Get-Content (Join-Path $root "apps\api\src\agent\tripContextResolver.ts") -Raw
if (
  -not $tripContextResolverSource.Contains("TripContextConfidence") -or
  -not $tripContextResolverSource.Contains("resolveTripReferenceForMessage") -or
  -not $tripContextResolverSource.Contains("clarificationQuestion") -or
  -not $tripContextResolverSource.Contains("nearest_lodging") -or
  -not $tripContextResolverSource.Contains("live_member_location")
) {
  throw "Kodi must resolve trip context through confidence-based origin/destination logic before using Google Routes."
}

$tripTimelineResolverSource = Get-Content (Join-Path $root "apps\api\src\agent\tripTimelineResolver.ts") -Raw
if (
  -not $tripTimelineResolverSource.Contains("TripTimelineSegment") -or
  -not $tripTimelineResolverSource.Contains("buildTripTimelineFromGoogleMapOrder") -or
  -not $tripTimelineResolverSource.Contains("resolveTimelineReferenceForMessage") -or
  -not $tripTimelineResolverSource.Contains("google_map_order_lodging_segments") -or
  -not $tripTimelineResolverSource.Contains("REGION_ALIASES") -or
  -not $tripTimelineResolverSource.Contains("timeline_lodging")
) {
  throw "Kodi must derive a trip timeline from Google map order and resolve future lodging/region references before external searches."
}

$serverSourceForContext = Get-Content (Join-Path $root "apps\api\src\server.ts") -Raw
if (
  -not $serverSourceForContext.Contains("resolveTripReferenceForMessage") -or
  -not $serverSourceForContext.Contains("resolveTimelineReferenceForMessage") -or
  -not $serverSourceForContext.Contains("authorizeTripUsageCapability") -or
  -not $serverSourceForContext.Contains("safeRecordUsageGateEvent") -or
  -not $serverSourceForContext.Contains("buildTripUsageAuditSummary") -or
  -not $serverSourceForContext.Contains("usageAudit") -or
  -not $serverSourceForContext.Contains("Usage gate authorized") -or
  -not $serverSourceForContext.Contains("chargedTo=") -or
  -not $serverSourceForContext.Contains("usageGateResults") -or
  -not $serverSourceForContext.Contains("/api/trips/demo/timeline") -or
  -not $serverSourceForContext.Contains("tripContextClarification") -or
  -not $serverSourceForContext.Contains("tripContextConfidence") -or
  -not $serverSourceForContext.Contains("timelineReferenceConfidence") -or
  -not $serverSourceForContext.Contains("tripReference.confidence !== `"low`"") -or
  -not $serverSourceForContext.Contains("tryBuildKodiReplyWithOpenAi") -or
  -not $serverSourceForContext.Contains('capability: "openai_agent"') -or
  -not $serverSourceForContext.Contains("agentRuntime") -or
  -not $serverSourceForContext.Contains("fallbackUsed") -or
  -not $serverSourceForContext.Contains("buildFocusedReferenceMessage") -or
  -not $serverSourceForContext.Contains("message: focusedReferenceMessage")
) {
  throw "Kodi agent flow must use trip context and trip timeline resolvers before choosing destinations or external search anchors."
}

$googleRoutesLiveSmokeSource = Get-Content (Join-Path $root "scripts\smoke-google-routes-live.mjs") -Raw
if (
  -not $googleRoutesLiveSmokeSource.Contains("GOOGLE_MAPS_API_KEY routes configured") -or
  -not $googleRoutesLiveSmokeSource.Contains("/api/google/routes/estimate") -or
  -not $googleRoutesLiveSmokeSource.Contains("/api/agent/message") -or
  -not $googleRoutesLiveSmokeSource.Contains("routeEstimateStatus") -or
  -not $googleRoutesLiveSmokeSource.Contains("route.payload.apiKey === undefined")
) {
  throw "Live Google Routes smoke must verify readiness, endpoint results, Kodi agent context, and no API key leakage."
}

$demoTripSource = Get-Content (Join-Path $root "apps\web\src\demoTrip.ts") -Raw
if (
  -not $demoTripSource.Contains("../../../data/demo-google-places.json") -or
  -not $demoTripSource.Contains("totalPlaces: googlePlaces.length")
) {
  throw "Web demo trip fallback must derive its places from the imported Google places source."
}

if (-not $demoTripSource.Contains("demoMembers")) {
  throw "Web demo trip is missing demo group members."
}

if ($demoTripSource.Contains("משפחת כהן")) {
  throw "Web app must not show invented family names in the trip shell."
}

if (-not $demoTripSource.Contains("locationSharing")) {
  throw "Web demo trip is missing location sharing consent state."
}

$appSource = Get-Content (Join-Path $root "apps\web\src\App.tsx") -Raw -Encoding UTF8
$styleSource = Get-Content (Join-Path $root "apps\web\src\styles.css") -Raw
if (
  -not $appSource.Contains("function shouldWakeKodi(text: string, currentMessages: ChatMessage[] = [])") -or
  -not $appSource.Contains("kodiWasRecentlyActive") -or
  -not $appSource.Contains("shouldWakeKodi(text, messages)")
) {
  throw "Web app must keep Kodi awake for natural follow-up questions after Kodi has already joined the conversation."
}

if (-not $appSource.Contains("/api/trips/demo/state")) {
  throw "Web app is not connected to the unified trip state API."
}

if (-not $appSource.Contains("/api/trips/demo/setup")) {
  throw "Web app is not connected to the setup activation API."
}

if (-not $appSource.Contains("activation-shell")) {
  throw "Web app is missing the Welcome + Activation shell."
}

if (-not $appSource.Contains("setShowActivation(false)")) {
  throw "Welcome + Activation must allow entering the trip account experience."
}

if (-not $appSource.Contains("setupDraft") -or -not $appSource.Contains("setupReady")) {
  throw "Welcome + Activation must manage an interactive setup draft and readiness state."
}

if (
  -not $appSource.Contains("ActivationStep") -or
  -not $appSource.Contains("guided-step") -or
  -not $appSource.Contains("activation-progress") -or
  -not $appSource.Contains("managerLocationReady") -or
  -not $appSource.Contains("manager_location") -or
  -not $appSource.Contains("source-feedback") -or
  -not $appSource.Contains("location-status") -or
  -not $appSource.Contains("primary-action")
) {
  throw "Welcome + Activation must be a guided one-step-at-a-time flow centered on Kodi, trip source, and manager location."
}

if (-not $appSource.Contains("saveSetupAndStart") -or -not $appSource.Contains('method: "POST"')) {
  throw "Welcome + Activation must save setup through the API before entering the app."
}

if (-not $appSource.Contains("tripName") -or -not $appSource.Contains("googleLink")) {
  throw "Welcome + Activation must collect trip name and Google Maps link."
}

if (-not $appSource.Contains("aiPlanMode") -or -not $appSource.Contains("plan-note")) {
  throw "Welcome + Activation must explain the owner-managed account and API usage model."
}

if (-not $appSource.Contains("Google Maps Place List")) {
  throw "Welcome + Activation must explain the Google Maps Place List source."
}

if (
  -not $appSource.Contains("/api/trips/demo/google-source") -or
  -not $appSource.Contains("googleSourcePreview") -or
  -not $appSource.Contains("liveGoogleAccess") -or
  -not $appSource.Contains("Read-only preview active") -or
  -not $appSource.Contains("write-back requires Google OAuth")
) {
  throw "Welcome + Activation must show the read-only Google source preview before live Google sync."
}

$forbiddenGoogleUiClaims = @(
  "live Google editing active",
  "Google write-back active",
  "editing your Google Maps list",
  "synced live with Google Maps",
  "changes are saved to Google Maps"
)

foreach ($claim in $forbiddenGoogleUiClaims) {
  if ($appSource.ToLowerInvariant().Contains($claim.ToLowerInvariant())) {
    throw "Forbidden Google UI claim before OAuth/write-back is real: $claim"
  }
}

if (-not $appSource.Contains("/api/trips/demo/members")) {
  throw "Web app is not connected to the demo members API."
}

if (-not $appSource.Contains("/api/trips/demo/messages") -or -not $appSource.Contains("sendMessageWithPersistence")) {
  throw "Web app must persist group chat messages through the demo messages API."
}

if (
  -not $appSource.Contains("chatRealtimeState") -or
  -not $appSource.Contains("/api/trips/demo/messages/stream") -or
  -not $appSource.Contains("trip-messages") -or
  -not $appSource.Contains("window.setInterval(pollGroupMessages, 4000)")
) {
  throw "Web app must stream group chat messages with a polling fallback."
}

if (-not $appSource.Contains("chat-sync-status")) {
  throw "Web app must show a quiet live sync status for the group chat."
}

if (-not $appSource.Contains("/api/trips/demo/events") -or -not $appSource.Contains("event-activity")) {
  throw "Web app must display the group event activity stream."
}

if (
  -not $appSource.Contains("usage-overview") -or
  -not $appSource.Contains("buildUsageAuditOverview") -or
  -not $appSource.Contains("Google Places") -or
  -not $appSource.Contains("Google Routes")
) {
  throw "Web app must display owner-visible usage audit counts near the group activity stream."
}

if (
  -not $appSource.Contains("eventRealtimeState") -or
  -not $appSource.Contains("/api/trips/demo/events/stream") -or
  -not $appSource.Contains("new EventSource") -or
  -not $appSource.Contains("startPollingFallback") -or
  -not $appSource.Contains("window.setInterval(pollTripEvents, 5000)")
) {
  throw "Web app must stream group events with a polling fallback."
}

if (-not $appSource.Contains("/api/navigation/links")) {
  throw "Web app is not connected to the navigation links API."
}

if (-not $appSource.Contains("openSelectedPlaceInWaze")) {
  throw "Web app is missing the Waze action."
}

if (
  -not $appSource.Contains('target: "waze" | "maps" | "walking"') -or
  -not $appSource.Contains('target === "walking" ? links.googleMapsWalking : links.googleMaps') -or
  -not $appSource.Contains('openPlaceNavigation(place, "maps")')
) {
  throw "Hamburger place cards must open each point in Google Maps, not only focus the internal map."
}

$navigationLinksSource = Get-Content (Join-Path $root "apps\api\src\navigation\links.ts") -Raw
if (
  -not $navigationLinksSource.Contains("googleMapsWalking") -or
  -not $navigationLinksSource.Contains("travelmode=walking") -or
  -not $appSource.Contains("openSelectedPlaceInGoogleMapsWalking") -or
  -not $appSource.Contains("links.googleMapsWalking")
) {
  throw "Web app must offer Google Maps walking navigation so Kodi does not recreate native walking guidance."
}

if (
  -not $appSource.Contains("renderMessageText") -or
  -not $appSource.Contains("messageUrlPattern") -or
  -not $appSource.Contains("waze.com/ul") -or
  -not $appSource.Contains("google.com/maps") -or
  -not $appSource.Contains('target="_blank"')
) {
  throw "Chat messages must render Waze and Google Maps URLs as tappable links."
}

if ($appSource.Contains("dangerouslySetInnerHTML")) {
  throw "Chat link rendering must not use dangerouslySetInnerHTML."
}

if (-not $styleSource.Contains(".message-link") -or -not $styleSource.Contains(".message-link.waze-link")) {
  throw "Chat navigation links must have visible tappable styling."
}

if (
  -not $appSource.Contains("messagesEndRef") -or
  -not $appSource.Contains("messagesContainerRef") -or
  -not $appSource.Contains("shouldStickToLatestMessageRef") -or
  -not $appSource.Contains("updateMessageScrollIntent") -or
  -not $appSource.Contains("container.scrollTop = container.scrollHeight") -or
  -not $styleSource.Contains(".app-shell") -or
  -not $styleSource.Contains("overflow: hidden") -or
  -not $styleSource.Contains("overscroll-behavior: contain") -or
  -not $styleSource.Contains("env(safe-area-inset-bottom)")
) {
  throw "Group chat must behave like a fixed-height WhatsApp-style conversation with internal message scrolling and a persistent composer."
}

if (
  -not $styleSource.Contains("grid-template-columns: minmax(0, auto) minmax(0, 1fr)") -or
  -not $styleSource.Contains("min-height: 48px") -or
  -not $styleSource.Contains("white-space: nowrap") -or
  -not $styleSource.Contains("#087f9d") -or
  -not $styleSource.Contains("#eaf9fd")
) {
  throw "Mobile group chat header must stay compact, one-line, and use the blue/turquoise visual direction."
}

if (-not $appSource.Contains("/api/trips/demo/agent-actions/authorize") -or -not $appSource.Contains("requestGroupDestinationApproval")) {
  throw "Web app must request server authorization before operational group actions."
}

if (
  -not $appSource.Contains("/api/trips/demo/group-destination") -or
  -not $appSource.Contains("/api/trips/demo/group-destination/stream") -or
  -not $appSource.Contains("groupDestination") -or
  -not $appSource.Contains("destinationRealtimeState") -or
  -not $appSource.Contains("group-destination")
) {
  throw "Web app must persist, display, and stream the current group destination after admin approval."
}

if (
  -not $appSource.Contains("/api/trips/demo/group-route") -or
  -not $appSource.Contains("/api/trips/demo/group-route/stream") -or
  -not $appSource.Contains("groupRoute") -or
  -not $appSource.Contains("routeRealtimeState") -or
  -not $appSource.Contains("group-route")
) {
  throw "Web app must persist, display, and stream the active group route after admin approval."
}

if (-not $appSource.Contains("activeRouteStopIndex") -or -not $appSource.Contains("openActiveRouteStopInWaze")) {
  throw "Web app must support an active route stop and navigation to it."
}

if (-not $appSource.Contains("completeActiveRouteStop") -or -not $appSource.Contains("completedStopIds")) {
  throw "Web app must support marking the active route stop as completed."
}

if (-not $appSource.Contains("actionApprovalState") -or -not $appSource.Contains("routeApprovalState")) {
  throw "Web app must show approval state for operational group actions."
}

if (-not $appSource.Contains("buildExternalAppShortcuts")) {
  throw "Web app is missing external app shortcuts."
}

if (-not $appSource.Contains("external-shortcuts")) {
  throw "Web app is missing the external shortcuts UI."
}

if (-not $appSource.Contains("userShortcuts") -or -not $appSource.Contains("addUserShortcut")) {
  throw "Web app is missing user-defined external shortcuts."
}

if (-not $appSource.Contains("/api/agent/message")) {
  throw "Web app is not connected to the Kodi agent API."
}

if (-not $appSource.Contains("tripGroupId") -or -not $appSource.Contains("permissionPolicy")) {
  throw "Web app must send structured group and permission context to Kodi."
}

if (-not $appSource.Contains("activeMemberId") -or -not $appSource.Contains("setActiveMemberId")) {
  throw "Web group chat must support choosing the active speaker."
}

if (-not $appSource.Contains("buildKodiFallbackReply")) {
  throw "Web app must keep a local Kodi fallback for demo resilience."
}

$agentTemplateLeaks = @(
  "שמעתי את",
  "מהשיחה אני מזהה",
  "מהשיחה האחרונה קלטתי",
  "אבקש אישור מנהל",
  "אם מנהל מאשר",
  "היעד הקבוצתי כרגע",
  "מכנה משותף"
)

$appFallbackSource = [regex]::Match($appSource, "function buildKodiFallbackReply[\s\S]*?function shouldWakeKodi").Value

foreach ($leak in $agentTemplateLeaks) {
  if ($appFallbackSource.Contains($leak) -or $kodiSourceEarly.Contains($leak)) {
    throw "Kodi agent/fallback must not leak rigid template phrasing: $leak"
  }
}

if (-not $appSource.Contains("kodi-presence")) {
  throw "Web app must show Kodi as a background presence, not a separate CTA."
}

if (
  $appSource.Contains('className="action-card"') -or
  $appSource.Contains('className="places-strip"') -or
  $styleSource.Contains(".map-surface > .action-card") -or
  $styleSource.Contains(".chat-sheet > .event-activity") -or
  $styleSource.Contains(".chat-sheet > .usage-overview")
) {
  throw "The primary app surface must stay clean: Google Maps area plus family/Kodi chat only; secondary controls belong in the hamburger menu."
}

if (
  -not $appSource.Contains("function shouldWakeKodi") -or
  -not $appSource.Contains("shouldAskKodi = shouldWakeKodi(text, messages)") -or
  -not $appSource.Contains("text.includes") -or
  -not $appSource.Contains("kodi|codex") -or
  -not $appSource.Contains("kodiWasRecentlyActive")
) {
  throw "Web group chat must wake Kodi when explicitly addressed or when a recent Kodi exchange has an obvious follow-up question."
}

if (-not $appSource.Contains("visibleMembers")) {
  throw "Web app must filter visible member locations by sharing consent."
}

if (
  -not $appSource.Contains("enablePersonalGps") -or
  -not $appSource.Contains("current-location-button") -or
  -not $appSource.Contains("Navigation size={17}") -or
  -not $appSource.Contains("navigator.geolocation") -or
  -not $appSource.Contains("watchPosition") -or
  -not $appSource.Contains("clearWatch") -or
  -not $appSource.Contains("locationWatchIdRef")
) {
  throw "Web app is missing a visible current-location action with explicit live location tracking and cleanup."
}

if (-not $styleSource.Contains(".current-location-button") -or -not $styleSource.Contains(".current-location-button.active")) {
  throw "Web app must style the visible current-location action in the map top bar."
}

if (
  -not $appSource.Contains("googleMapFitSignatureRef") -or
  -not $appSource.Contains("mapFitSignature") -or
  $appSource.Contains("map.setCenter(center)") -or
  $appSource.Contains("map.setZoom(mapAnchorLocation")
) {
  throw "Google Maps viewport must not be re-centered and re-zoomed on every live location update."
}

if (-not $appSource.Contains("/api/trips/demo/members/") -or -not $appSource.Contains("locationSyncState")) {
  throw "Web app must sync personal live location to the demo member location endpoint."
}

if (
  -not $appSource.Contains("memberRealtimeState") -or
  -not $appSource.Contains("/api/trips/demo/members/stream") -or
  -not $appSource.Contains("trip-members") -or
  -not $appSource.Contains("window.setInterval(pollMemberLocations, 5000)")
) {
  throw "Web app must stream member locations with a polling fallback."
}

if (-not $appSource.Contains('memberRealtimeState === "live"')) {
  throw "Web app must show a quiet live sync status for group member locations."
}

if (-not $appSource.Contains("group-location-layer")) {
  throw "Web app is missing the live group location map layer."
}

if (-not $appSource.Contains("trip-map-layer") -or -not $appSource.Contains("map-provider-note")) {
  throw "Web app is missing the internal map layer that connects places, live location and group locations."
}

if (
  -not $appSource.Contains("GOOGLE_MAPS_BROWSER_API_KEY") -or
  -not $appSource.Contains("VITE_GOOGLE_MAPS_API_KEY") -or
  -not $appSource.Contains("getMapProviderStatus") -or
  -not $appSource.Contains("googleMapInstanceRef") -or
  -not $appSource.Contains("googleMapMarkersRef") -or
  -not $appSource.Contains("mapPlaces.forEach") -or
  -not $appSource.Contains("map.fitBounds") -or
  -not $serverSourceForContext.Contains("/api/config/maps")
) {
  throw "Web app is missing map provider configuration or stable Google Maps instance handling."
}

if (
  -not $appSource.Contains("DEFAULT_NEARBY_MAP_RADIUS_KM = 40") -or
  -not $appSource.Contains("DEFAULT_VISIBLE_PLACE_LIMIT = 40") -or
  -not $appSource.Contains("const mapPlaces = useMemo(() =>") -or
  -not $appSource.Contains("filter((place) => typeof place.lat === `"number`" && typeof place.lng === `"number`")") -or
  -not $appSource.Contains("[places]") -or
  -not $appSource.Contains("openCurrentMapInGoogleMaps") -or
  -not $appSource.Contains("open-google-maps-button") -or
  -not $styleSource.Contains("grid-template-rows: clamp(170px, 32dvh, 260px) minmax(0, 1fr)") -or
  -not $styleSource.Contains(".open-google-maps-button")
) {
  throw "Mobile core UX must prioritize chat, keep all coordinate-backed trip points on the map, and expose a direct Google Maps handoff."
}

if ($styleSource.Contains(".map-placeholder span")) {
  throw "Map placeholder typography must target direct children only; nested button/link text must not inherit the giant fallback map title style."
}

if (
  -not $appSource.Contains("trip-places-menu") -or
  -not $appSource.Contains("trip-place-list") -or
  -not $appSource.Contains("menuPlaces.map") -or
  -not $appSource.Contains("advanced-menu") -or
  -not $appSource.Contains("<summary>")
) {
  throw "The hamburger menu must expose the full trip place list behind a collapsed advanced section."
}

if (
  -not $appSource.Contains("tripInviteUrl") -or
  -not $appSource.Contains("copyTripInviteLink") -or
  -not $appSource.Contains("shareTripInvite") -or
  -not $appSource.Contains("navigator.share") -or
  -not $appSource.Contains("Share2") -or
  -not $appSource.Contains("joinTripFromInvite") -or
  -not $appSource.Contains("showJoinFlow") -or
  -not $appSource.Contains("join-shell") -or
  -not $appSource.Contains("invite-menu") -or
  -not $appSource.Contains("whatsapp-style-share-link") -or
  -not $appSource.Contains("per-device-location-consent") -or
  -not $appSource.Contains("location-menu") -or
  -not $appSource.Contains("group_family_greece_demo")
) {
  throw "Web app must support a simple WhatsApp-style invite flow: native share, fallback copy, name, per-device location consent, and shared Kodi chat."
}

if (
  -not $coreExperienceSource.Contains("WhatsApp is the UX model") -or
  -not $coreExperienceSource.Contains("Web Share first") -or
  -not $coreExperienceSource.Contains("copy-link fallback")
) {
  throw "Core experience doc must define WhatsApp as the invite UX model, not the product source of truth."
}

if ($appSource.Contains("agent-button")) {
  throw "Web app still contains the old separate-agent CTA."
}

$domainTypesSource = Get-Content (Join-Path $root "apps\api\src\domain\types.ts") -Raw
if (-not $domainTypesSource.Contains("LiveLocation")) {
  throw "Domain model is missing LiveLocation."
}

if (-not $domainTypesSource.Contains("LocationSharingConsent")) {
  throw "Domain model is missing LocationSharingConsent."
}

if (-not $domainTypesSource.Contains("TripSetupState")) {
  throw "Domain model is missing TripSetupState."
}

if (-not $domainTypesSource.Contains("groupDestination")) {
  throw "Domain model is missing the active group destination state."
}

if (-not $domainTypesSource.Contains("groupRoute")) {
  throw "Domain model is missing the active group route state."
}

if (-not $domainTypesSource.Contains("TripEvent") -or -not $domainTypesSource.Contains("TripEventType")) {
  throw "Domain model is missing the group event log model."
}

$serverSource = Get-Content (Join-Path $root "apps\api\src\server.ts") -Raw -Encoding UTF8
if (-not $serverSource.Contains("/api/agent/message")) {
  throw "API server is missing the Kodi agent endpoint."
}

if (-not $serverSource.Contains("member context is required")) {
  throw "Kodi agent endpoint must require member context."
}

if (-not $serverSource.Contains("recentMessages must be an array")) {
  throw "Kodi agent endpoint must validate recentMessages."
}

if (-not $serverSource.Contains("contextSummary")) {
  throw "Kodi agent endpoint must return a structured context summary."
}

if (
  -not $serverSource.Contains("shouldUseExternalPlacesSearch") -or
  -not $serverSource.Contains("buildExternalPlacesQuery") -or
  -not $serverSource.Contains("externalPlacesSearchStatus") -or
  -not $serverSource.Contains("searchGooglePlacesText")
) {
  throw "Kodi agent endpoint must connect eligible nearby-needs questions to the guarded Google Places read path."
}

if (
  -not $serverSource.Contains("buildFastTripAnswer") -or
  -not $serverSource.Contains("skipped_fast_lane") -or
  -not $serverSource.Contains("latencyMs") -or
  -not $serverSource.Contains("buildAgentTripStateSnapshot")
) {
  throw "Kodi agent endpoint must keep a fast lane for simple trip-context answers before invoking the full AI agent."
}

if (-not $serverSource.Contains("/api/trips/demo/members") -or -not $serverSource.Contains("/api/trips/demo/members/stream")) {
  throw "API server is missing demo members endpoints."
}

if (
  -not $serverSource.Contains("/api/trips/demo/google-source") -or
  -not $serverSource.Contains("buildDemoGoogleSourcePreview") -or
  -not $serverSource.Contains("/api/trips/demo/google-source/readiness") -or
  -not $serverSource.Contains("getGoogleSourceReadiness") -or
  -not $serverSource.Contains("/api/google/places/text-search") -or
  -not $serverSource.Contains("searchGooglePlacesText")
) {
  throw "API server is missing the read-only Google source preview, readiness, or Places Text Search endpoint."
}

if (-not $serverSource.Contains("/api/trips/demo/messages")) {
  throw "API server is missing the demo group messages endpoint."
}

if (-not $serverSource.Contains("/api/trips/demo/storage") -or -not $serverSource.Contains("getDemoStorageMetadata")) {
  throw "API server must expose demo storage metadata for DB/realtime migration readiness."
}

if (-not $serverSource.Contains("/api/trips/demo/storage/supabase-check") -or -not $serverSource.Contains("checkSupabaseRuntime")) {
  throw "API server must expose a safe Supabase runtime readiness check before switching storage drivers."
}

if (-not $serverSource.Contains("/api/trips/demo/storage/supabase-bridge/verify") -or -not $serverSource.Contains("relational_supabase_tables")) {
  throw "API server must keep the legacy bridge endpoint as a non-writing retired compatibility response."
}

if (-not $serverSource.Contains("/api/admin/supabase/apply-grants") -or -not $serverSource.Contains("x-kodi-admin-token")) {
  throw "API server must expose the Supabase grants endpoint only behind an admin token."
}

if (-not $serverSource.Contains("/api/trips/demo/agent-actions/authorize")) {
  throw "API server is missing the agent action authorization endpoint."
}

if (
  -not $serverSource.Contains("/api/trips/demo/group-destination") -or
  -not $serverSource.Contains("/api/trips/demo/group-destination/stream")
) {
  throw "API server is missing active group destination endpoints."
}

if (-not $serverSource.Contains("/api/trips/demo/group-route") -or -not $serverSource.Contains("/api/trips/demo/group-route/stream")) {
  throw "API server is missing active group route endpoints."
}

if (-not $serverSource.Contains("/api/trips/demo/group-route/progress")) {
  throw "API server is missing the group route progress endpoint."
}

if (-not $serverSource.Contains("/api/trips/demo/events") -or -not $serverSource.Contains("recordDemoTripEvent")) {
  throw "API server is missing the group event log endpoint or event recording hook."
}

if (-not $serverSource.Contains("apply-event-log-migration")) {
  throw "API server is missing the guarded Supabase event log migration endpoint."
}

if (-not $serverSource.Contains("routeCompleted") -or -not $serverSource.Contains('status: routeCompleted ? "completed"')) {
  throw "API server must mark a group route completed after the final stop."
}

if (-not $serverSource.Contains("canMemberRunAgentAction")) {
  throw "API server must enforce agent action permissions through a dedicated policy."
}

if (-not $serverSource.Contains("saveDemoGroupDestination") -or -not $serverSource.Contains("resetDemoGroupDestination")) {
  throw "API server must persist and reset the active group destination."
}

if (-not $serverSource.Contains("saveDemoGroupRoute") -or -not $serverSource.Contains("resetDemoGroupRoute")) {
  throw "API server must persist and reset the active group route."
}

if (
  -not $serverSource.Contains("appendDemoTripMessage") -or
  -not $serverSource.Contains("resetDemoTripMessages") -or
  -not $serverSource.Contains("/api/trips/demo/messages/stream") -or
  -not $serverSource.Contains("event: trip-messages")
) {
  throw "API server must append, reset, and stream persisted demo group chat messages."
}

if (-not $serverSource.Contains("/api/trips/demo/members/:memberId/location")) {
  throw "API server is missing the demo member location update endpoint."
}

if (-not $serverSource.Contains("updateDemoMemberLocation")) {
  throw "API server must delegate demo member location updates through the consent-aware data layer."
}

$localMembersSource = Get-Content (Join-Path $root "apps\api\src\data\localMembers.ts") -Raw
if (-not $localMembersSource.Contains("location_sharing_not_enabled")) {
  throw "Demo member data layer must block location updates for members without sharing consent."
}

if (-not $localMembersSource.Contains("live_locations") -or -not $localMembersSource.Contains("location_sharing_consents")) {
  throw "Demo member data layer must use relational Supabase member, consent, and live location tables when Supabase storage is active."
}

if (-not $localMembersSource.Contains("saveDemoStorage") -or -not $localMembersSource.Contains("updateSupabaseMemberLocation")) {
  throw "Demo member data layer must persist location updates through Supabase with file fallback."
}

$demoStorageSource = Get-Content (Join-Path $root "apps\api\src\data\demoStorage.ts") -Raw
if (-not $demoStorageSource.Contains(".data") -or -not $demoStorageSource.Contains("demo-state.json")) {
  throw "Demo storage must write to the local .data demo-state.json file."
}

$supabaseClientSource = Get-Content (Join-Path $root "apps\api\src\data\supabaseClient.ts") -Raw
if (-not $demoStorageSource.Contains("STORAGE_DRIVER") -or -not $supabaseClientSource.Contains("SUPABASE_SERVICE_ROLE_KEY")) {
  throw "Demo storage metadata must expose the Supabase storage driver configuration gate."
}

if (-not $demoStorageSource.Contains("loadDemoStorageAsync") -or -not $demoStorageSource.Contains("saveDemoStorageAsync")) {
  throw "Demo storage must include async file fallback functions for local development."
}

$doubleQuotedBridgeQuery = '.from("demo_storage_states"'
$singleQuotedBridgeQuery = ".from('demo_storage_states'"

if (
  $demoStorageSource.Contains($doubleQuotedBridgeQuery) -or
  $demoStorageSource.Contains($singleQuotedBridgeQuery) -or
  $demoStorageSource.Contains("verifySupabaseBridgeStorage")
) {
  throw "Demo storage must not use the retired Supabase JSON bridge in the active runtime path."
}

if (-not $demoStorageSource.Contains("relationalStorageReady") -or -not $demoStorageSource.Contains("jsonBridgeActive")) {
  throw "Demo storage metadata must expose relational readiness and retired JSON bridge state."
}

if (-not $demoStorageSource.Contains("messages: StoredDemoMessage[] | null")) {
  throw "Demo storage must include persisted group chat messages."
}

$localMessagesSource = Get-Content (Join-Path $root "apps\api\src\data\localMessages.ts") -Raw
if (-not $localMessagesSource.Contains("initialDemoMessages") -or -not $localMessagesSource.Contains("appendDemoTripMessage")) {
  throw "Demo messages data layer must provide initial messages and append persisted messages."
}

if (
  -not $localMessagesSource.Contains('message.author === "QA"') -or
  -not $localMessagesSource.Contains("includes(message.author)") -or
  -not $localMessagesSource.Contains("message.text.trim") -or
  -not $localMessagesSource.Contains("retiredSeedMessageTextFragments.some")
) {
  throw "Demo messages must filter QA/system, invented-family, and corrupted legacy messages out of the user-facing chat."
}

if (-not $localMessagesSource.Contains("group_messages") -or -not $localMessagesSource.Contains("DEMO_TRIP_GROUP_UUID")) {
  throw "Demo messages must use the relational Supabase group_messages table when Supabase storage is active."
}

$localMembersSource = Get-Content (Join-Path $root "apps\api\src\data\localMembers.ts") -Raw
$demoRelationalIdsSource = Get-Content (Join-Path $root "apps\api\src\data\demoRelationalIds.ts") -Raw
foreach ($inventedMemberName in @("אמא", "אבא", "נועה", "סבתא")) {
  if ($localMembersSource.Contains("displayName: `"$inventedMemberName`"") -or $demoRelationalIdsSource.Contains("displayName: `"$inventedMemberName`"")) {
    throw "Default members must use neutral role labels, not invented family names: $inventedMemberName"
  }
}

$localDestinationSource = Get-Content (Join-Path $root "apps\api\src\data\localGroupDestination.ts") -Raw
if (-not $localDestinationSource.Contains("group_destinations") -or -not $localDestinationSource.Contains("ensureDemoTripPlace")) {
  throw "Demo group destination must use relational Supabase destination and place tables when Supabase storage is active."
}

$localRouteSource = Get-Content (Join-Path $root "apps\api\src\data\localGroupRoute.ts") -Raw
if (-not $localRouteSource.Contains("group_routes") -or -not $localRouteSource.Contains("group_route_stops")) {
  throw "Demo group route must use relational Supabase route and route stop tables when Supabase storage is active."
}

$localEventsSource = Get-Content (Join-Path $root "apps\api\src\data\localEvents.ts") -Raw
if (-not $localEventsSource.Contains("group_events") -or -not $localEventsSource.Contains("recordDemoTripEventAsync")) {
  throw "Demo event log must use the relational Supabase group_events table when available with file fallback."
}

if (-not $serverSource.Contains("apply-relational-route-migration")) {
  throw "API server is missing the guarded Supabase relational route migration endpoint."
}

$setupSource = Get-Content (Join-Path $root "apps\api\src\data\localSetupState.ts") -Raw
if (-not $setupSource.Contains("setup_saved_at") -or -not $setupSource.Contains("google_source_state")) {
  throw "Demo setup state must use relational trip_groups setup columns when Supabase storage is active."
}

if (-not $serverSource.Contains("apply-setup-state-migration")) {
  throw "API server is missing the guarded Supabase setup state migration endpoint."
}

$agentActionsSource = Get-Content (Join-Path $root "apps\api\src\permissions\agentActions.ts") -Raw
if (-not $agentActionsSource.Contains("operational_action_requires_admin") -or -not $agentActionsSource.Contains("set_group_destination")) {
  throw "Agent action policy must block operational actions unless the actor is an admin."
}

if (-not $serverSource.Contains("resetDemoTripMembers")) {
  throw "Demo setup reset must also reset demo member locations for deterministic QA."
}

$gitIgnoreSource = Get-Content (Join-Path $root ".gitignore") -Raw
if (-not $gitIgnoreSource.Contains(".data/")) {
  throw "Local persisted demo data must be ignored by Git."
}

if (-not $serverSource.Contains("/api/trips/demo/state")) {
  throw "API server is missing the unified trip state endpoint."
}

if (-not $serverSource.Contains("/api/trips/demo/setup")) {
  throw "API server is missing the demo setup endpoint."
}

if (-not $serverSource.Contains('app.post("/api/trips/demo/setup"')) {
  throw "API server is missing the demo setup save endpoint."
}

if (
  -not $serverSource.Contains('app.post("/api/trips/demo/google-source/switch"') -or
  -not $serverSource.Contains("canManageTripMapSource") -or
  -not $serverSource.Contains("actorMemberId") -or
  -not $serverSource.Contains("valid Google Maps viewing link is required")
) {
  throw "API server must expose an admin-gated Google Maps source switch endpoint."
}

if (-not $serverSource.Contains("buildDemoTripSetupState")) {
  throw "API server is missing the demo setup state builder."
}

if (-not $serverSource.Contains("saveDemoTripSetupState")) {
  throw "API server is missing the demo setup state saver."
}

if (-not $serverSource.Contains("resetDemoTripSetupState")) {
  throw "API server is missing the demo setup state reset for deterministic smoke tests."
}

if (
  -not $serverSource.Contains("const tripState = req.body?.tripState ?? buildDemoTripState()") -and
  -not $serverSource.Contains("const tripState = req.body?.tripState ?? (await buildDemoTripStateAsync())") -and
  -not $serverSource.Contains("const tripState = withRequestCurrentLocation")
) {
  throw "Kodi agent endpoint must attach TripState context when the client does not send one."
}

if ($serverSource.Contains("agent_not_implemented") -or $serverSource.Contains("501")) {
  throw "Kodi agent endpoint still looks like a placeholder."
}

$kodiSource = Get-Content (Join-Path $root "apps\api\src\agent\kodi.ts") -Raw -Encoding utf8
if (-not $kodiSource.Contains("buildVisibleLocationSummary")) {
  throw "Kodi agent is missing TripState-based location summary logic."
}

if (
  -not $kodiSource.Contains("כאן ועכשיו") -or
  -not $kodiSource.Contains("לא לפי מסלול יוון") -or
  -not $kodiSource.Contains("מיקום החי שלכם כנקודת העוגן")
) {
  throw "Kodi fallback must answer here-and-now requests from live location instead of the planned itinerary."
}

if (-not $kodiSource.Contains("selectRecommendedPlace")) {
  throw "Kodi agent is missing TripState-based place recommendation logic."
}

if (-not $kodiSource.Contains("scorePlace")) {
  throw "Kodi agent is missing detailed recommendation scoring."
}

if (-not $kodiSource.Contains("describeRejectedAlternative")) {
  throw "Kodi agent must explain why alternatives were rejected."
}

if (-not $kodiSource.Contains("summarizePlaceNote")) {
  throw "Kodi agent must clean noisy place notes before presenting them."
}

if (-not $kodiSource.Contains("summarizeRecentConversation") -or -not $kodiSource.Contains("mentionedNeeds")) {
  throw "Kodi agent must summarize recent family conversation needs before replying."
}

if (-not $kodiSource.Contains("currentDestinationName") -or -not $kodiSource.Contains("groupDestination")) {
  throw "Kodi agent must include the active group destination in conversation context."
}

if (-not $kodiSource.Contains("place_recommendation")) {
  throw "Kodi agent is missing the place_recommendation intent."
}

if (
  -not $kodiSource.Contains("externalPlacesSearch") -or
  -not $kodiSource.Contains("buildExternalPlacesContext") -or
  -not $kodiSource.Contains("GOOGLE_MAPS_API_KEY") -or
  -not $kodiSource.Contains("Google Places")
) {
  throw "Kodi agent must explain guarded Google Places search context without pretending live results exist."
}

$storageSource = Get-Content (Join-Path $root "apps\api\src\data\demoStorage.ts") -Raw
if (-not $storageSource.Contains("DemoStorageDriver") -or -not $storageSource.Contains("activeDemoStorageDriver")) {
  throw "Demo storage must use a driver contract before moving from .data to DB."
}

if (-not $storageSource.Contains("migrationTarget") -or -not $storageSource.Contains("realtimeReady")) {
  throw "Demo storage metadata must describe DB/realtime migration readiness."
}

$supabaseSchemaSource = Get-Content (Join-Path $root "supabase\schema.sql") -Raw
foreach ($requiredTable in @(
  "trip_groups",
  "trip_members",
  "trip_places",
  "location_sharing_consents",
  "live_locations",
  "group_messages",
  "group_destinations",
  "group_routes",
  "group_route_stops",
  "group_events"
)) {
  if (-not $supabaseSchemaSource.Contains("public.$requiredTable")) {
    throw "Supabase schema is missing table: $requiredTable"
  }
}

if ($supabaseSchemaSource.Contains("public.demo_storage_states")) {
  Write-Host "Notice: legacy demo_storage_states table is still present in schema for backward compatibility."
}

foreach ($realtimeTable in @(
  "group_messages",
  "live_locations",
  "group_destinations",
  "group_routes",
  "group_route_stops",
  "group_events"
)) {
  if (-not $supabaseSchemaSource.Contains("alter publication supabase_realtime add table public.$realtimeTable")) {
    throw "Supabase schema must publish realtime table: $realtimeTable"
  }
}

if (-not $supabaseSchemaSource.Contains("enable row level security")) {
  throw "Supabase schema must enable RLS before production use."
}

if (-not $supabaseSchemaSource.Contains("grant all privileges on all tables in schema public to service_role")) {
  throw "Supabase schema must grant service_role access for backend-only storage."
}

$supabaseGrantsSource = Get-Content (Join-Path $root "supabase\service-role-grants.sql") -Raw
if (-not $supabaseGrantsSource.Contains("grant all privileges on all tables in schema public to service_role")) {
  throw "Supabase grants file must grant service_role access for backend-only storage."
}

$supabaseStatusSource = Get-Content (Join-Path $root "apps\api\src\data\supabaseStatus.ts") -Raw
if (-not $supabaseStatusSource.Contains("keyRole") -or -not $supabaseStatusSource.Contains("decodeJwtPayload")) {
  throw "Supabase status must report the configured key role without exposing the key."
}

if (-not $supabaseStatusSource.Contains("relationalTablesReady") -or $supabaseStatusSource.Contains($doubleQuotedBridgeQuery) -or $supabaseStatusSource.Contains($singleQuotedBridgeQuery)) {
  throw "Supabase status must verify relational runtime tables, not the retired JSON bridge table."
}

$envExampleSource = Get-Content (Join-Path $root ".env.example") -Raw
foreach ($requiredEnvName in @("STORAGE_DRIVER=file", "SUPABASE_URL=", "SUPABASE_SERVICE_ROLE_KEY=")) {
  if (-not $envExampleSource.Contains($requiredEnvName)) {
    throw ".env.example is missing Supabase environment contract: $requiredEnvName"
  }
}

foreach ($requiredGoogleEnvName in @("GOOGLE_MAPS_API_KEY=", "GOOGLE_OAUTH_CLIENT_ID=", "GOOGLE_OAUTH_CLIENT_SECRET=", "GOOGLE_OAUTH_REDIRECT_URI=")) {
  if (-not $envExampleSource.Contains($requiredGoogleEnvName)) {
    throw ".env.example is missing Google integration environment contract: $requiredGoogleEnvName"
  }
}

if (-not $envExampleSource.Contains("OPENAI_WEB_SEARCH_ENABLED=true")) {
  throw ".env.example must expose OPENAI_WEB_SEARCH_ENABLED for Kodi's agentic web-search capability."
}

if (-not $envExampleSource.Contains("MIGRATION_ADMIN_TOKEN=")) {
  throw ".env.example must include MIGRATION_ADMIN_TOKEN for guarded migration automation."
}

$migrationAdminSource = Get-Content (Join-Path $root "apps\api\src\data\supabaseMigrationAdmin.ts") -Raw
if (-not $migrationAdminSource.Contains("MIGRATION_ADMIN_TOKEN") -or -not $migrationAdminSource.Contains("service-role-grants.sql")) {
  throw "Supabase migration admin must be guarded by MIGRATION_ADMIN_TOKEN and run only the grants file."
}

$schemaScriptSource = Get-Content (Join-Path $root "scripts\apply-supabase-schema.mjs") -Raw
if (-not $schemaScriptSource.Contains("SUPABASE_DB_URL") -or -not $schemaScriptSource.Contains("group_messages")) {
  throw "Automated Supabase schema script must read SUPABASE_DB_URL and verify relational runtime tables."
}

$grantsScriptSource = Get-Content (Join-Path $root "scripts\apply-supabase-grants.mjs") -Raw
if (-not $grantsScriptSource.Contains("has_table_privilege") -or -not $grantsScriptSource.Contains("service_role")) {
  throw "Automated Supabase grants script must verify service_role table privileges."
}

if (-not $serverSource.Contains("Access-Control-Allow-Origin")) {
  throw "API server is missing local CORS headers for the web app."
}

if (-not $serverSource.Contains("http://127.0.0.1:5173")) {
  throw "API server must allow the local Vite 127.0.0.1 origin."
}

if (-not $serverSource.Contains('req.method === "OPTIONS"')) {
  throw "API server is missing an OPTIONS handler for browser preflight requests."
}

$secretFiles = Get-ChildItem -Path $root -Recurse -Force -File |
  Where-Object { $_.Name -match "^\.env$|^\.env\." -and $_.Name -ne ".env.example" }

if ($secretFiles.Count -gt 0) {
  throw "Secret env files found. Do not commit .env files."
}

Write-Host "Skeleton QA passed."
