# Regression Test - Existing API Endpoint Integrity
$ErrorActionPreference = "Continue"

Write-Host "=== API Regression Check ===" -ForegroundColor Magenta

$passed = 0
$failed = 0

# Check system.ts endpoints
Write-Host "`n[P0] Verifying system API endpoints..." -ForegroundColor Cyan
$systemApi = Get-Content "app\src\server\api\system.ts" -Raw

$systemEndpoints = @(
    @{ Path = "/system/status"; Method = "GET" }
    @{ Path = "/system/logs"; Method = "GET" }
    @{ Path = "/system/reboot"; Method = "POST" }
    @{ Path = "/system/shutdown"; Method = "POST" }
    @{ Path = "/system/test/cpu"; Method = "POST" }
    @{ Path = "/system/test/memory"; Method = "POST" }
    @{ Path = "/system/test/status"; Method = "GET" }
)

foreach ($endpoint in $systemEndpoints) {
    $pattern = "router\.$($endpoint.Method.ToLower())\([`"']$([regex]::Escape($endpoint.Path))"
    if ($systemApi -match $pattern) {
        Write-Host "  [PASS] $($endpoint.Method) $($endpoint.Path)" -ForegroundColor Green
        $passed++
    }
    else {
        Write-Host "  [FAIL] $($endpoint.Method) $($endpoint.Path) not found" -ForegroundColor Red
        $failed++
    }
}

# Check power.ts endpoints
Write-Host "`n[P0] Verifying power API endpoints..." -ForegroundColor Cyan
$powerApi = Get-Content "app\src\server\api\power.ts" -Raw

$powerEndpoints = @(
    @{ Path = "/mode"; Method = "POST" }
    @{ Path = "/mode"; Method = "GET" }
)

foreach ($endpoint in $powerEndpoints) {
    $pattern = "router\.$($endpoint.Method.ToLower())\([`"']$([regex]::Escape($endpoint.Path))"
    if ($powerApi -match $pattern) {
        Write-Host "  [PASS] $($endpoint.Method) $($endpoint.Path)" -ForegroundColor Green
        $passed++
    }
    else {
        Write-Host "  [FAIL] $($endpoint.Method) $($endpoint.Path) not found" -ForegroundColor Red
        $failed++
    }
}

# Check llm.ts endpoints
Write-Host "`n[P0] Verifying LLM API endpoints..." -ForegroundColor Cyan
$llmApi = Get-Content "app\src\server\api\llm.ts" -Raw

$llmEndpoints = @(
    @{ Path = "/llm/touch"; Method = "POST" }
    @{ Path = "/llm/start"; Method = "POST" }
    @{ Path = "/llm/stop"; Method = "POST" }
)

foreach ($endpoint in $llmEndpoints) {
    $pattern = "router\.$($endpoint.Method.ToLower())\([`"']$([regex]::Escape($endpoint.Path))"
    if ($llmApi -match $pattern) {
        Write-Host "  [PASS] $($endpoint.Method) $($endpoint.Path)" -ForegroundColor Green
        $passed++
    }
    else {
        Write-Host "  [FAIL] $($endpoint.Method) $($endpoint.Path) not found" -ForegroundColor Red
        $failed++
    }
}

# Check that new Steam endpoints don't break routing
Write-Host "`n[P0] Verifying router mounting order..." -ForegroundColor Cyan
$server = Get-Content "app\src\server\server.ts" -Raw

$routers = @("createPowerRouter", "createLlmRouter", "createSystemRouter", "createSteamRouter")
$allMounted = $true

foreach ($router in $routers) {
    if ($server -match "app\.use\(`"/api`".*$router") {
        Write-Host "  [PASS] $router is mounted at /api" -ForegroundColor Green
    }
    else {
        Write-Host "  [FAIL] $router not mounted properly" -ForegroundColor Red
        $allMounted = $false
    }
}

# Check types.ts interface exports
Write-Host "`n[P1] Verifying type exports..." -ForegroundColor Cyan
$types = Get-Content "app\src\shared\types.ts" -Raw

$criticalTypes = @(
    "PowerMode",
    "SystemStatus",
    "GpuStatus",
    "SystemMetrics",
    "SteamQueueJob",
    "SteamSessionState",
    "SteamQueueEnqueueResponse"
)

foreach ($type in $criticalTypes) {
    if ($types -match "export (type|interface) $type") {
        Write-Host "  [PASS] $type is exported" -ForegroundColor Green
        $passed++
    }
    else {
        Write-Host "  [FAIL] $type not exported" -ForegroundColor Red
        $failed++
    }
}

# Check no breaking changes to existing response formats
Write-Host "`n[P0] Verifying SystemStatus interface integrity..." -ForegroundColor Cyan
$requiredFields = @(
    "mode",
    "llmGatewayEnabled",
    "llmReady",
    "lastUsedAt",
    "gpus",
    "system",
    "gateway",
    "ak620"
)

$allPresent = $true
foreach ($field in $requiredFields) {
    if ($types -match "$field\s*:") {
        Write-Host "  [PASS] SystemStatus.$field present" -ForegroundColor Green
    }
    else {
        Write-Host "  [FAIL] SystemStatus.$field missing (breaking change!)" -ForegroundColor Red
        $allPresent = $false
    }
}

# Check new fields were added correctly
Write-Host "`n[P0] Verifying new Steam fields in SystemStatus..." -ForegroundColor Cyan
$newFields = @("steamSessionActive", "steamSessionStartedAt", "queueSummary")

foreach ($field in $newFields) {
    if ($types -match "$field\s*:") {
        Write-Host "  [PASS] SystemStatus.$field added" -ForegroundColor Green
        $passed++
    }
    else {
        Write-Host "  [FAIL] SystemStatus.$field missing" -ForegroundColor Red
        $failed++
    }
}

# Summary
Write-Host "`n=== Regression Check Summary ===" -ForegroundColor Magenta
Write-Host "Passed: $passed"
Write-Host "Failed: $failed"

if ($failed -eq 0) {
    Write-Host "`n[SUCCESS] No regressions detected" -ForegroundColor Green
    exit 0
}
else {
    Write-Host "`n[FAILURE] $failed regressions detected" -ForegroundColor Red
    exit 1
}
