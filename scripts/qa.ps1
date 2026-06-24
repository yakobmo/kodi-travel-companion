$ErrorActionPreference = "Stop"

Write-Host "Running AI Travel Companion skeleton QA..."

$root = Split-Path -Parent $PSScriptRoot
$requiredFiles = @(
  "package.json",
  ".env.example",
  "README.md",
  "DEVELOPMENT_WORKFLOW.md",
  "supabase/schema.sql",
  "docs/SUPABASE_SCHEMA.md",
  "scripts/apply-supabase-schema.mjs",
  "scripts/apply-supabase-schema.ps1",
  "scripts/apply-supabase-grants.mjs",
  "scripts/apply-supabase-grants.ps1",
  "scripts/dev-api.ps1",
  "scripts/dev-web.ps1",
  "scripts/smoke-local.mjs",
  "apps/api/package.json",
  "apps/api/tsconfig.json",
  "apps/api/src/server.ts",
  "apps/api/src/agent/kodi.ts",
  "apps/api/src/domain/types.ts",
  "apps/api/src/data/demoStorage.ts",
  "apps/api/src/data/supabaseStatus.ts",
  "apps/api/src/data/supabaseMigrationAdmin.ts",
  "apps/api/src/data/localMessages.ts",
  "apps/api/src/data/localMembers.ts",
  "apps/api/src/data/localPlaces.ts",
  "apps/api/src/data/localSetupState.ts",
  "apps/api/src/data/localTripState.ts",
  "apps/api/src/permissions/agentActions.ts",
  "apps/web/package.json",
  "apps/web/tsconfig.json",
  "apps/web/index.html",
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

$demoTripSource = Get-Content (Join-Path $root "apps\web\src\demoTrip.ts") -Raw
if (-not $demoTripSource.Contains("totalPlaces: 108")) {
  throw "Web demo trip summary does not reference the imported 108 places."
}

if (-not $demoTripSource.Contains("demoMembers")) {
  throw "Web demo trip is missing demo group members."
}

if (-not $demoTripSource.Contains("locationSharing")) {
  throw "Web demo trip is missing location sharing consent state."
}

$appSource = Get-Content (Join-Path $root "apps\web\src\App.tsx") -Raw
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
  throw "Welcome + Activation must allow entering the demo app."
}

if (-not $appSource.Contains("setupDraft") -or -not $appSource.Contains("setupReady")) {
  throw "Welcome + Activation must manage an interactive setup draft and readiness state."
}

if (-not $appSource.Contains("saveSetupAndStart") -or -not $appSource.Contains('method: "POST"')) {
  throw "Welcome + Activation must save setup through the API before entering the app."
}

if (-not $appSource.Contains("tripName") -or -not $appSource.Contains("googleLink")) {
  throw "Welcome + Activation must collect trip name and Google Maps link."
}

if (-not $appSource.Contains("aiPlanMode") -or -not $appSource.Contains("plan-note")) {
  throw "Welcome + Activation must explain demo/paid API limitations."
}

if (-not $appSource.Contains("Google Maps Place List")) {
  throw "Welcome + Activation must explain the Google Maps Place List source."
}

if (-not $appSource.Contains("/api/trips/demo/members")) {
  throw "Web app is not connected to the demo members API."
}

if (-not $appSource.Contains("/api/trips/demo/messages") -or -not $appSource.Contains("sendMessageWithPersistence")) {
  throw "Web app must persist group chat messages through the demo messages API."
}

if (-not $appSource.Contains("chatRealtimeState") -or -not $appSource.Contains("window.setInterval(pollGroupMessages, 4000)")) {
  throw "Web app must poll group chat messages for a basic live conversation experience."
}

if (-not $appSource.Contains("chat-sync-status")) {
  throw "Web app must show a quiet live sync status for the group chat."
}

if (-not $appSource.Contains("/api/navigation/links")) {
  throw "Web app is not connected to the navigation links API."
}

if (-not $appSource.Contains("openSelectedPlaceInWaze")) {
  throw "Web app is missing the Waze action."
}

if (-not $appSource.Contains("/api/trips/demo/agent-actions/authorize") -or -not $appSource.Contains("requestGroupDestinationApproval")) {
  throw "Web app must request server authorization before operational group actions."
}

if (-not $appSource.Contains("/api/trips/demo/group-destination") -or -not $appSource.Contains("groupDestination")) {
  throw "Web app must persist and display the current group destination after admin approval."
}

if (-not $appSource.Contains("/api/trips/demo/group-route") -or -not $appSource.Contains("groupRoute")) {
  throw "Web app must persist and display the active group route after admin approval."
}

if (-not $appSource.Contains("activeRouteStopIndex") -or -not $appSource.Contains("openActiveRouteStopInWaze")) {
  throw "Web app must support an active route stop and navigation to it."
}

if (-not $appSource.Contains("completeActiveRouteStop") -or -not $appSource.Contains("completedStopIds")) {
  throw "Web app must support marking the active route stop as completed."
}

if (-not $appSource.Contains("route-completed-note") -or -not $appSource.Contains("groupRoute.status === `"completed`"")) {
  throw "Web app must show and respect the completed route state."
}

if (-not $appSource.Contains("actionApprovalState") -or -not $appSource.Contains("secondary-action")) {
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

if (-not $appSource.Contains("kodi-presence")) {
  throw "Web app must show Kodi as a background presence, not a separate CTA."
}

if (-not $appSource.Contains("visibleMembers")) {
  throw "Web app must filter visible member locations by sharing consent."
}

if (-not $appSource.Contains("enablePersonalGps") -or -not $appSource.Contains("navigator.geolocation")) {
  throw "Web app is missing explicit personal GPS opt-in."
}

if (-not $appSource.Contains("/api/trips/demo/members/") -or -not $appSource.Contains("locationSyncState")) {
  throw "Web app must sync personal GPS to the demo member location endpoint."
}

if (-not $appSource.Contains("memberRealtimeState") -or -not $appSource.Contains("window.setInterval(pollMemberLocations, 5000)")) {
  throw "Web app must poll member locations for a basic live group map experience."
}

if (-not $appSource.Contains("׳¡׳ ׳›׳¨׳•׳ ׳—׳™ ׳₪׳¢׳™׳")) {
  throw "Web app must show a quiet live sync status for group member locations."
}

if (-not $appSource.Contains("group-location-layer")) {
  throw "Web app is missing the live group location map layer."
}

if (-not $appSource.Contains("trip-map-layer") -or -not $appSource.Contains("map-provider-note")) {
  throw "Web app is missing the internal map layer that connects places, GPS and group locations."
}

if (-not $appSource.Contains("VITE_GOOGLE_MAPS_API_KEY") -or -not $appSource.Contains("getMapProviderStatus")) {
  throw "Web app is missing map provider configuration for Google/fallback switching."
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

$serverSource = Get-Content (Join-Path $root "apps\api\src\server.ts") -Raw
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

if (-not $serverSource.Contains("/api/trips/demo/members")) {
  throw "API server is missing the demo members endpoint."
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

if (-not $serverSource.Contains("/api/trips/demo/storage/supabase-bridge/verify") -or -not $serverSource.Contains("verifySupabaseBridgeStorage")) {
  throw "API server must expose a safe Supabase bridge verification endpoint before switching live storage."
}

if (-not $serverSource.Contains("/api/admin/supabase/apply-grants") -or -not $serverSource.Contains("x-kodi-admin-token")) {
  throw "API server must expose the Supabase grants endpoint only behind an admin token."
}

if (-not $serverSource.Contains("/api/trips/demo/agent-actions/authorize")) {
  throw "API server is missing the agent action authorization endpoint."
}

if (-not $serverSource.Contains("/api/trips/demo/group-destination")) {
  throw "API server is missing the active group destination endpoint."
}

if (-not $serverSource.Contains("/api/trips/demo/group-route")) {
  throw "API server is missing the active group route endpoint."
}

if (-not $serverSource.Contains("/api/trips/demo/group-route/progress")) {
  throw "API server is missing the group route progress endpoint."
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

if (-not $serverSource.Contains("appendDemoTripMessage") -or -not $serverSource.Contains("resetDemoTripMessages")) {
  throw "API server must append and reset persisted demo group chat messages."
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

if (-not $localMembersSource.Contains("saveDemoStorage")) {
  throw "Demo member data layer must persist location updates through demo storage."
}

$demoStorageSource = Get-Content (Join-Path $root "apps\api\src\data\demoStorage.ts") -Raw
if (-not $demoStorageSource.Contains(".data") -or -not $demoStorageSource.Contains("demo-state.json")) {
  throw "Demo storage must write to the local .data demo-state.json file."
}

if (-not $demoStorageSource.Contains("STORAGE_DRIVER") -or -not $demoStorageSource.Contains("SUPABASE_SERVICE_ROLE_KEY")) {
  throw "Demo storage metadata must expose the future Supabase storage driver configuration gate."
}

if (-not $demoStorageSource.Contains("loadDemoStorageAsync") -or -not $demoStorageSource.Contains("saveDemoStorageAsync")) {
  throw "Demo storage must include async bridge functions before Supabase migration."
}

if (-not $demoStorageSource.Contains("messages: StoredDemoMessage[] | null")) {
  throw "Demo storage must include persisted group chat messages."
}

$localMessagesSource = Get-Content (Join-Path $root "apps\api\src\data\localMessages.ts") -Raw
if (-not $localMessagesSource.Contains("initialDemoMessages") -or -not $localMessagesSource.Contains("appendDemoTripMessage")) {
  throw "Demo messages data layer must provide initial messages and append persisted messages."
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

if (-not $serverSource.Contains("buildDemoTripSetupState")) {
  throw "API server is missing the demo setup state builder."
}

if (-not $serverSource.Contains("saveDemoTripSetupState")) {
  throw "API server is missing the demo setup state saver."
}

if (-not $serverSource.Contains("resetDemoTripSetupState")) {
  throw "API server is missing the demo setup state reset for deterministic smoke tests."
}

if (-not $serverSource.Contains("const tripState = req.body?.tripState ?? buildDemoTripState()")) {
  throw "Kodi agent endpoint must attach TripState context when the client does not send one."
}

if ($serverSource.Contains("agent_not_implemented") -or $serverSource.Contains("501")) {
  throw "Kodi agent endpoint still looks like a placeholder."
}

$kodiSource = Get-Content (Join-Path $root "apps\api\src\agent\kodi.ts") -Raw
if (-not $kodiSource.Contains("buildVisibleLocationSummary")) {
  throw "Kodi agent is missing TripState-based location summary logic."
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
  "group_route_stops"
)) {
  if (-not $supabaseSchemaSource.Contains("public.$requiredTable")) {
    throw "Supabase schema is missing table: $requiredTable"
  }
}

if (-not $supabaseSchemaSource.Contains("public.demo_storage_states")) {
  throw "Supabase schema must include the demo storage bridge table before enabling the runtime driver."
}

foreach ($realtimeTable in @(
  "group_messages",
  "live_locations",
  "group_destinations",
  "group_routes",
  "group_route_stops"
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

$envExampleSource = Get-Content (Join-Path $root ".env.example") -Raw
foreach ($requiredEnvName in @("STORAGE_DRIVER=file", "SUPABASE_URL=", "SUPABASE_SERVICE_ROLE_KEY=")) {
  if (-not $envExampleSource.Contains($requiredEnvName)) {
    throw ".env.example is missing Supabase environment contract: $requiredEnvName"
  }
}

if (-not $envExampleSource.Contains("MIGRATION_ADMIN_TOKEN=")) {
  throw ".env.example must include MIGRATION_ADMIN_TOKEN for guarded migration automation."
}

$migrationAdminSource = Get-Content (Join-Path $root "apps\api\src\data\supabaseMigrationAdmin.ts") -Raw
if (-not $migrationAdminSource.Contains("MIGRATION_ADMIN_TOKEN") -or -not $migrationAdminSource.Contains("service-role-grants.sql")) {
  throw "Supabase migration admin must be guarded by MIGRATION_ADMIN_TOKEN and run only the grants file."
}

$schemaScriptSource = Get-Content (Join-Path $root "scripts\apply-supabase-schema.mjs") -Raw
if (-not $schemaScriptSource.Contains("SUPABASE_DB_URL") -or -not $schemaScriptSource.Contains("demo_storage_states")) {
  throw "Automated Supabase schema script must read SUPABASE_DB_URL and verify the bridge table."
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
