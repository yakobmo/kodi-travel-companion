param(
  [Parameter(Mandatory=$true)]
  [string]$Message,

  [switch]$NoPush
)

$ErrorActionPreference = "Stop"

Write-Host "Running QA before publish..."
& "$PSScriptRoot\qa.ps1"

Write-Host "Publish flow placeholder."
Write-Host "Next implementation will add git diff, commit, push, and Render smoke test."

if ($NoPush) {
  Write-Host "NoPush enabled. Push will be skipped."
}
