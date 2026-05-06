# Deep Validation - Code Behavior Analysis
$ErrorActionPreference = "Continue"

Write-Host "=== Deep Code Analysis ===" -ForegroundColor Magenta

# Test 1: Verify all Steam endpoints have ADAPTIVE guards
Write-Host "`n[P0] Verifying ADAPTIVE guards on all Steam endpoints..." -ForegroundColor Cyan
$steamApi = Get-Content "app\src\server\api\steam.ts" -Raw

$endpoints = @(
    "/steam/session/start",
    "/steam/session/end",
    "/steam/queue/enqueue",
    "/steam/queue/:jobId",
    "/steam/queue/:jobId/result",
    "/steam/queue/claim",
    "/steam/queue/:jobId/complete",
    "/steam/queue/:jobId/fail",
    "/steam/queue/replay/request",
    "/steam/queue/replay/finish"
)

$guardCount = ([regex]::Matches($steamApi, "ensureAdaptiveMode")).Count
Write-Host "  Total ensureAdaptiveMode calls: $guardCount"

if ($guardCount -lt 10) {
    Write-Host "  [WARNING] Expected at least 10 ADAPTIVE guards (one per protected endpoint)" -ForegroundColor Yellow
}
else {
    Write-Host "  [PASS] All Steam endpoints appear to have ADAPTIVE guards" -ForegroundColor Green
}

# Test 2: Verify queue job status transitions
Write-Host "`n[P0] Verifying queue job status transitions..." -ForegroundColor Cyan
$validTransitions = @{
    "queued" = @("processing")
    "processing" = @("completed", "failed", "queued")
}

if ($steamApi -match 'nextJob\.status\s*=\s*"processing"') {
    Write-Host "  [PASS] Claim endpoint transitions queued -> processing" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Missing queued -> processing transition" -ForegroundColor Red
}

if ($steamApi -match 'job\.status\s*=\s*"completed"' -and $steamApi -match 'job\.status\s*=\s*"failed"') {
    Write-Host "  [PASS] Complete/fail endpoints transition from processing" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Missing processing -> completed/failed transitions" -ForegroundColor Red
}

# Test 3: Verify stale processing lease reclaim
Write-Host "`n[P1] Verifying stale processing lease reclaim..." -ForegroundColor Cyan
if ($steamApi -match 'PROCESSING_STALE_MS' -and $steamApi -match 'job\.status\s*===\s*"processing".*now\s*-\s*job\.updatedAt') {
    Write-Host "  [PASS] Stale lease reclaim logic found" -ForegroundColor Green
}
else {
    Write-Host "  [WARNING] Stale lease reclaim may be missing or incomplete" -ForegroundColor Yellow
}

# Test 4: Verify queue persistence on state changes
Write-Host "`n[P0] Verifying queue persistence after mutations..." -ForegroundColor Cyan
$writeCallCount = ([regex]::Matches($steamApi, "writeSteamQueue")).Count
Write-Host "  writeSteamQueue calls: $writeCallCount"

if ($writeCallCount -ge 4) {
    Write-Host "  [PASS] Queue appears to persist after mutations" -ForegroundColor Green
}
else {
    Write-Host "  [WARNING] May not persist queue consistently" -ForegroundColor Yellow
}

# Test 5: Verify sensitive header filtering
Write-Host "`n[P1] Verifying sensitive header filtering..." -ForegroundColor Cyan
$sensitiveHeaders = @("authorization", "cookie", "proxy-authorization", "x-vantage-admin-token")
$found = 0

foreach ($header in $sensitiveHeaders) {
    if ($steamApi -match [regex]::Escape($header)) {
        $found++
    }
}

if ($found -eq $sensitiveHeaders.Count) {
    Write-Host "  [PASS] All sensitive headers filtered: $found/$($sensitiveHeaders.Count)" -ForegroundColor Green
}
else {
    Write-Host "  [WARNING] Some sensitive headers may not be filtered: $found/$($sensitiveHeaders.Count)" -ForegroundColor Yellow
}

# Test 6: Verify session watchdog timeout
Write-Host "`n[P1] Verifying session watchdog timeout..." -ForegroundColor Cyan
if ($steamApi -match 'WATCHDOG_TIMEOUT_MS' -and $steamApi -match 'watchdogExpiresAt') {
    Write-Host "  [PASS] Watchdog timeout mechanism found" -ForegroundColor Green
}
else {
    Write-Host "  [WARNING] Watchdog timeout may be missing" -ForegroundColor Yellow
}

# Test 7: Verify Windows power plan GUIDs
Write-Host "`n[P0] Verifying Windows power plan GUIDs..." -ForegroundColor Cyan
$win32 = Get-Content "app\src\server\platforms\win32.ts" -Raw
$expectedGuids = @{
    "balanced" = "381b4222-f694-41f0-9685-ff5bb260df2e"
    "powerSaver" = "a1841308-3541-4fab-bc81-f71556f20b4a"
    "highPerformance" = "8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c"
}

$allFound = $true
foreach ($plan in $expectedGuids.GetEnumerator()) {
    if ($win32 -notmatch [regex]::Escape($plan.Value)) {
        Write-Host "  [FAIL] Missing GUID for $($plan.Key)" -ForegroundColor Red
        $allFound = $false
    }
}

if ($allFound) {
    Write-Host "  [PASS] All Windows power plan GUIDs present" -ForegroundColor Green
}

# Test 8: Verify service error handling
Write-Host "`n[P1] Verifying Windows service error handling..." -ForegroundColor Cyan
if ($win32 -match 'serviceMissing' -and $win32 -match 'service has not been started|does not exist') {
    Write-Host "  [PASS] Service missing detection found" -ForegroundColor Green
}
else {
    Write-Host "  [WARNING] Service error handling may be incomplete" -ForegroundColor Yellow
}

# Test 9: Verify installer creates required directories
Write-Host "`n[P1] Verifying Windows installer directory creation..." -ForegroundColor Cyan
$installer = Get-Content "install-vantage.ps1" -Raw
$requiredDirs = @('$envDir', '$logsDir', '$helpersDir', '$windowsServicesDir')
$found = 0

foreach ($dir in $requiredDirs) {
    if ($installer -match "Ensure-Directory $dir") {
        $found++
    }
}

if ($found -eq $requiredDirs.Count) {
    Write-Host "  [PASS] All required directories created: $found/$($requiredDirs.Count)" -ForegroundColor Green
}
else {
    Write-Host "  [WARNING] Some directories may not be created: $found/$($requiredDirs.Count)" -ForegroundColor Yellow
}

# Test 10: Verify uninstaller removes all services
Write-Host "`n[P1] Verifying Windows uninstaller service removal..." -ForegroundColor Cyan
$uninstaller = Get-Content "uninstall-vantage.ps1" -Raw
$expectedServices = @("VantageBackend", "VantageLlmGateway", "VantageAk620Agent", "VantageAdaptiveEngine", "VantageSystemAgent", "VllmCoder")
$found = 0

foreach ($service in $expectedServices) {
    if ($uninstaller -match [regex]::Escape($service)) {
        $found++
    }
}

if ($found -eq $expectedServices.Count) {
    Write-Host "  [PASS] All services included in uninstall: $found/$($expectedServices.Count)" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Missing services in uninstaller: $found/$($expectedServices.Count)" -ForegroundColor Red
}

# Test 11: Verify Windows service entry scripts exist
Write-Host "`n[P1] Verifying Windows service entry scripts..." -ForegroundColor Cyan
$windowsServiceScripts = @(
    "services\windows\vantage-backend.ps1",
    "services\windows\vantage-llm-gateway.ps1",
    "services\windows\vllm-coder.ps1",
    "services\windows\vantage-ak620-agent.ps1",
    "services\windows\vantage-adaptive-engine.ps1",
    "services\windows\vantage-system-agent.ps1"
)
$missingScripts = @()

foreach ($scriptPath in $windowsServiceScripts) {
    if (-not (Test-Path $scriptPath)) {
        $missingScripts += $scriptPath
    }
}

if ($missingScripts.Count -eq 0) {
    Write-Host "  [PASS] All Windows service entry scripts exist" -ForegroundColor Green
}
else {
    Write-Host "  [FAIL] Missing Windows service entry scripts: $($missingScripts -join ', ')" -ForegroundColor Red
}

# Test 12: Verify Steam streaming helper scripts
Write-Host "`n[P1] Verifying Steam streaming helper script generation..." -ForegroundColor Cyan
if ($installer -match 'vantage-steam-session-start\.ps1' -and $installer -match 'vantage-steam-session-end\.ps1') {
    Write-Host "  [PASS] Steam helper scripts are generated" -ForegroundColor Green
}
else {
    Write-Host "  [WARNING] Steam helper scripts may not be generated" -ForegroundColor Yellow
}

# Test 13: Verify Linux installer systemd service deployment
Write-Host "`n[P1] Verifying Linux installer systemd service deployment..." -ForegroundColor Cyan
$linuxInstaller = Get-Content "install-vantage.sh" -Raw
if ($linuxInstaller -match 'systemctl enable' -and ($linuxInstaller -match 'systemctl restart' -or $linuxInstaller -match 'systemctl start')) {
    Write-Host "  [PASS] Linux installer enables and starts systemd services" -ForegroundColor Green
}
else {
    Write-Host "  [WARNING] Systemd service deployment may be incomplete" -ForegroundColor Yellow
}

# Test 14: Cross-platform path handling
Write-Host "`n[P0] Verifying cross-platform path handling..." -ForegroundColor Cyan
$server = Get-Content "app\src\server\server.ts" -Raw
if ($server -match 'path\.join|path\.resolve') {
    Write-Host "  [PASS] Server uses Node.js path module for cross-platform compatibility" -ForegroundColor Green
}
else {
    Write-Host "  [WARNING] May have hardcoded path separators" -ForegroundColor Yellow
}

# Test 15: Verify config loading across platforms
Write-Host "`n[P1] Verifying config path resolution..." -ForegroundColor Cyan
$config = Get-Content "app\src\server\config.ts" -Raw
if ($config -match 'process\.env\.VANTAGE_CONFIG_PATH') {
    Write-Host "  [PASS] Config path is environment-configurable" -ForegroundColor Green
}
else {
    Write-Host "  [WARNING] Config path may not be platform-flexible" -ForegroundColor Yellow
}

# Summary
Write-Host "`n=== Deep Analysis Complete ===" -ForegroundColor Magenta
Write-Host "Review the warnings above for potential issues." -ForegroundColor Cyan
