param(
  [string]$BaseUrl = "http://localhost:3000",
  [string]$Token = $env:AI_API_BEARER_TOKEN
)

if ([string]::IsNullOrWhiteSpace($Token)) {
  throw "AI_API_BEARER_TOKEN is required. Set it in your environment or pass -Token."
}

$headers = @{
  Authorization = "Bearer $Token"
  "Content-Type" = "application/json"
}

Write-Host "GET /api/ai/policy"
Invoke-RestMethod -Uri "$BaseUrl/api/ai/policy" -Method Get -Headers $headers | ConvertTo-Json -Depth 10

Write-Host "\nGET /api/ai/customers/lookup?phone=555-123-4567"
Invoke-RestMethod -Uri "$BaseUrl/api/ai/customers/lookup?phone=555-123-4567" -Method Get -Headers $headers | ConvertTo-Json -Depth 10

$availabilityBody = @{
  serviceType = "oil change"
  serviceChannel = "shop"
  requestedDate = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
  preferredTimeWindow = "morning"
} | ConvertTo-Json

Write-Host "\nPOST /api/ai/availability/check"
Invoke-RestMethod -Uri "$BaseUrl/api/ai/availability/check" -Method Post -Headers $headers -Body $availabilityBody | ConvertTo-Json -Depth 10
