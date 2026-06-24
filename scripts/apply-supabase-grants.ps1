$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$nodeDir = Join-Path $root ".tools\node-v24.14.0-win-x64"
$nodeExe = Join-Path $nodeDir "node.exe"

if (-not (Test-Path $nodeExe)) {
  $nodeExe = "node"
}

if (-not $env:SUPABASE_DB_URL -and -not $env:DATABASE_URL) {
  throw "Missing SUPABASE_DB_URL or DATABASE_URL. Set it locally before running this script. Do not paste secrets into chat."
}

Push-Location $root
try {
  & $nodeExe ".\scripts\apply-supabase-grants.mjs"
}
finally {
  Pop-Location
}
