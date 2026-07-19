param(
  [Parameter(Mandatory = $true)]
  [string]$Owner,

  [Parameter(Mandatory = $true)]
  [string]$Repo,

  [string]$SecretName = "AI_API_BEARER_TOKEN"
)

$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot\..
$token = node scripts/generate-api-token.js
if (-not $token) {
  throw "Failed to generate API token"
}

$repoSlug = "$Owner/$Repo"
$token | gh secret set $SecretName --repo $repoSlug
if ($LASTEXITCODE -ne 0) {
  throw "Failed to update GitHub secret $SecretName for $repoSlug"
}

$preview = if ($token.Length -gt 8) { "$($token.Substring(0,4))...$($token.Substring($token.Length-4))" } else { "(hidden)" }
Write-Host "Secret rotated for $repoSlug ($SecretName). New token preview: $preview"
Write-Host "Update your runtime environment token to match this secret before next deployment."
