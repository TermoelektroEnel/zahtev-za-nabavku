# ============================================================
#  Jednokratna migracija zahteva iz starog data.json -> Supabase
#  ------------------------------------------------------------
#  KORISTI service_role KLJUČ (zaobilazi RLS) — SAMO lokalno!
#  NE commit-uj ovaj ključ i ne stavljaj ga u HTML/JS fajlove.
#
#  PRIPREMA:
#   1) Skini data.json iz GitHub repo-a (web: repo -> data.json -> "Download raw file")
#      i sačuvaj ga u ovaj folder kao data.json
#   2) U Supabase Dashboard: Project Settings -> API -> "service_role" secret -> Copy
#   3) U PowerShell-u (u ovom folderu) postavi ključ u promenljivu okruženja:
#         $env:SUPABASE_SERVICE_ROLE_KEY = "<nalepi service_role kljuc>"
#   4) Pokreni:
#         .\migrate-requests.ps1
#
#  Skripta je idempotentna po redni_broj (upsert), pa je bezbedno pokrenuti ponovo.
# ============================================================

param(
  [string]$DataFile = ".\data.json",
  [string]$SupabaseUrl = "https://qxwrfrsjkhhrtepyliru.supabase.co"
)

$ErrorActionPreference = "Stop"

$serviceKey = $env:SUPABASE_SERVICE_ROLE_KEY
if ([string]::IsNullOrWhiteSpace($serviceKey)) {
  Write-Error "Nedostaje service_role kljuc. Postavi ga sa: `$env:SUPABASE_SERVICE_ROLE_KEY = '...'"
  exit 1
}
if (-not (Test-Path $DataFile)) {
  Write-Error "Nije pronadjen $DataFile. Skini data.json iz repo-a i stavi ga ovde."
  exit 1
}

$data = Get-Content -Path $DataFile -Raw -Encoding UTF8 | ConvertFrom-Json
$requests = @($data.requests)
if ($requests.Count -eq 0) {
  Write-Host "Nema zahteva u data.json — nema sta da se migrira." -ForegroundColor Yellow
  exit 0
}

$headers = @{
  "apikey"        = $serviceKey
  "Authorization" = "Bearer $serviceKey"
  "Content-Type"  = "application/json"
  "Prefer"        = "resolution=merge-duplicates,return=minimal"
}

$epoch = [DateTime]::SpecifyKind([DateTime]::Parse("1970-01-01T00:00:00"), [DateTimeKind]::Utc)

# --- Redovi za requests ---
$rows = foreach ($r in $requests) {
  $created = if ($r.createdAt) { $epoch.AddMilliseconds([double]$r.createdAt).ToString("o") } else { (Get-Date).ToUniversalTime().ToString("o") }
  [ordered]@{
    redni_broj = [string]$r.redniBroj
    gradiliste = [string]$r.gradiliste
    godina     = [string]$r.godina
    nalog      = [string]$r.nalog
    stavke     = $r.stavke
    created_at = $created
  }
}

$body = ConvertTo-Json -InputObject @($rows) -Depth 30
Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/requests?on_conflict=redni_broj" -Headers $headers -Body $body | Out-Null
Write-Host ("Migrirano zahteva: " + $rows.Count) -ForegroundColor Green

# --- Brojaci: najveci redni broj po gradilistu (da se ne recikliraju brojevi) ---
$counters = @{}
foreach ($r in $requests) {
  $g = [string]$r.gradiliste
  $parts = ([string]$r.redniBroj).Split("/")
  $num = 0
  if ($parts.Length -ge 3) { [int]::TryParse($parts[2], [ref]$num) | Out-Null }
  if (-not $counters.ContainsKey($g) -or $num -gt $counters[$g]) { $counters[$g] = $num }
}
# Uzmi u obzir i postojece brojace iz data.json
if ($data.counters) {
  foreach ($p in $data.counters.PSObject.Properties) {
    $g = $p.Name; $v = [int]$p.Value
    if (-not $counters.ContainsKey($g) -or $v -gt $counters[$g]) { $counters[$g] = $v }
  }
}

$counterRows = foreach ($k in $counters.Keys) {
  [ordered]@{ gradiliste = [string]$k; last = [int]$counters[$k] }
}
if (@($counterRows).Count -gt 0) {
  $cbody = ConvertTo-Json -InputObject @($counterRows) -Depth 5
  Invoke-RestMethod -Method Post -Uri "$SupabaseUrl/rest/v1/counters?on_conflict=gradiliste" -Headers $headers -Body $cbody | Out-Null
  Write-Host ("Azurirano brojaca: " + @($counterRows).Count) -ForegroundColor Green
}

Write-Host "Gotovo. Proveri podatke u Supabase Table Editor-u." -ForegroundColor Cyan
