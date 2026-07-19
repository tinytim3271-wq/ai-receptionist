param(
  [Parameter(Mandatory = $true)]
  [string]$Owner,

  [Parameter(Mandatory = $true)]
  [string]$Repo,

  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "GitHub CLI is not authenticated. Run: gh auth login"
}

$body = @{
  required_status_checks = @{
    strict = $true
    contexts = @("test")
  }
  enforce_admins = $true
  required_pull_request_reviews = @{
    dismiss_stale_reviews = $true
    require_code_owner_reviews = $false
    required_approving_review_count = 1
    require_last_push_approval = $false
  }
  restrictions = $null
  required_linear_history = $true
  allow_force_pushes = $false
  allow_deletions = $false
  block_creations = $false
  required_conversation_resolution = $true
  lock_branch = $false
  allow_fork_syncing = $true
} | ConvertTo-Json -Depth 10 -Compress

$endpoint = "repos/$Owner/$Repo/branches/$Branch/protection"
 $tempFile = [System.IO.Path]::GetTempFileName()

Write-Host "Applying branch protection to $Owner/$Repo on branch $Branch..."
Set-Content -Path $tempFile -Value $body -Encoding UTF8
$null = gh api --method PUT --header "Accept: application/vnd.github+json" --input $tempFile $endpoint
Remove-Item -Path $tempFile -Force -ErrorAction SilentlyContinue

if ($LASTEXITCODE -ne 0) {
  throw "Failed to apply branch protection. Check owner/repo/branch and token permissions."
}

Write-Host "Branch protection applied successfully."
Write-Host "Required status check context: test"
