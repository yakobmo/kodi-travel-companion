$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$nodeDir = Join-Path $root ".tools\node-v24.14.0-win-x64"
$npm = Join-Path $nodeDir "npm.cmd"

if (-not (Test-Path $npm)) {
  throw "Local npm not found. Run dependency setup first."
}

$env:Path = "$nodeDir;$env:Path"
Set-Location $root
& $npm run dev --workspace apps/web -- --host 127.0.0.1 --port 5173
