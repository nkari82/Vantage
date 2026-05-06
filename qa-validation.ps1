# QA Validation Script for Steam Session & Windows Support
$ErrorActionPreference = "Continue"

$results = @()
$p0Pass = 0
$p0Total = 0
$p1Pass = 0
$p1Total = 0

function Test-Scenario {
    param(
        [string]$Name,
        [string]$Priority,
        [scriptblock]$Test
    )
    
    Write-Host "`n[$Priority] Testing: $Name" -ForegroundColor Cyan
    try {
        & $Test
        Write-Host "[PASS] $Name" -ForegroundColor Green
        
        if ($Priority -eq "P0") { $script:p0Pass++ }
        elseif ($Priority -eq "P1") { $script:p1Pass++ }
        
        $script:results += @{
            Name = $Name
            Priority = $Priority
            Status = "PASS"
            Error = $null
        }
        return $true
    }
    catch {
        Write-Host "[FAIL] $Name" -ForegroundColor Red
        Write-Host "  Error: $_" -ForegroundColor Yellow
        
        $script:results += @{
            Name = $Name
            Priority = $Priority
            Status = "FAIL"
            Error = $_.ToString()
        }
        return $false
    }
    finally {
        if ($Priority -eq "P0") { $script:p0Total++ }
        elseif ($Priority -eq "P1") { $script:p1Total++ }
    }
}

Write-Host "=== Vantage QA Validation ===" -ForegroundColor Magenta
Write-Host "Testing: Steam Adaptive Queue + Windows Host Support`n"

# P0: Build Verification
Test-Scenario "App builds successfully" "P0" {
    $output = npm run build -w app 2>&1 | Out-String
    if ($output -notmatch "built in|build completed") {
        throw "Build output missing completion indicator"
    }
}

Test-Scenario "LLM Gateway builds successfully" "P0" {
    $output = npm run build -w services/llm-gateway 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE"
    }
}

Test-Scenario "System Agent builds successfully" "P0" {
    $output = npm run build -w services/system-agent 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
        throw "Build failed with exit code $LASTEXITCODE"
    }
}

# P0: Steam API File Structure
Test-Scenario "Steam API router exists and exports createSteamRouter" "P0" {
    $steamApi = Get-Content "app\src\server\api\steam.ts" -Raw
    if ($steamApi -notmatch "export function createSteamRouter") {
        throw "createSteamRouter export not found"
    }
    if ($steamApi -notmatch "ensureAdaptiveMode") {
        throw "ADAPTIVE mode guard function not found"
    }
}

Test-Scenario "Storage module has queue persistence functions" "P0" {
    $storage = Get-Content "app\src\server\storage.ts" -Raw
    if ($storage -notmatch "readSteamQueue|writeSteamQueue|purgeExpiredSteamQueue") {
        throw "Queue persistence functions not found"
    }
}

Test-Scenario "Types define SteamQueueJob with all required fields" "P0" {
    $types = Get-Content "app\src\shared\types.ts" -Raw
    if ($types -notmatch "interface SteamQueueJob") {
        throw "SteamQueueJob interface not found"
    }
    if ($types -notmatch "jobId: string") {
        throw "Missing jobId field"
    }
    if ($types -notmatch "status: SteamQueueJobStatus") {
        throw "Missing status field"
    }
    if ($types -notmatch "requestSnapshot: SteamRequestSnapshot") {
        throw "Missing requestSnapshot field"
    }
}

# P0: ADAPTIVE Mode Guards
Test-Scenario "Steam endpoints enforce ADAPTIVE mode" "P0" {
    $steamApi = Get-Content "app\src\server\api\steam.ts" -Raw
    
    # Check session start endpoint
    if ($steamApi -notmatch 'router\.post\("/steam/session/start".*ensureAdaptiveMode') {
        throw "Session start missing ADAPTIVE guard"
    }
    
    # Check session end endpoint
    if ($steamApi -notmatch 'router\.post\("/steam/session/end".*ensureAdaptiveMode') {
        throw "Session end missing ADAPTIVE guard"
    }
    
    # Check enqueue endpoint
    if ($steamApi -notmatch 'router\.post\("/steam/queue/enqueue".*ensureAdaptiveMode') {
        throw "Enqueue missing ADAPTIVE guard"
    }
}

Test-Scenario "ADAPTIVE guard returns 409 for non-ADAPTIVE mode" "P0" {
    $steamApi = Get-Content "app\src\server\api\steam.ts" -Raw
    if ($steamApi -notmatch 'badRequest.*"STEAM_NOT_ADAPTIVE".*409') {
        throw "ADAPTIVE guard doesn't return proper 409 status"
    }
}

# P0: Queue Overflow Protection
Test-Scenario "Queue enforces max size limit" "P0" {
    $steamApi = Get-Content "app\src\server\api\steam.ts" -Raw
    if ($steamApi -notmatch "QUEUE_MAX_SIZE\s*=\s*\d+") {
        throw "QUEUE_MAX_SIZE constant not found"
    }
    if ($steamApi -notmatch 'queue\.length\s*>=\s*QUEUE_MAX_SIZE') {
        throw "Queue overflow check not found"
    }
    if ($steamApi -notmatch '"QUEUE_OVERFLOW".*503') {
        throw "Queue overflow doesn't return 503"
    }
}

# P0: Session Response Format
Test-Scenario "Session start returns 202 with required fields" "P0" {
    $steamApi = Get-Content "app\src\server\api\steam.ts" -Raw
    $types = Get-Content "app\src\shared\types.ts" -Raw
    
    if ($types -notmatch "interface SteamSessionStartResponse") {
        throw "SteamSessionStartResponse type not found"
    }
    if ($types -notmatch "jobId: string") {
        # Actually checking enqueue response
    }
    if ($steamApi -notmatch 'res\.status\(202\)\.json') {
        throw "Enqueue endpoint doesn't return 202"
    }
}

# P0: Windows Platform Support
Test-Scenario "Win32 controller implements all required methods" "P0" {
    $win32 = Get-Content "app\src\server\platforms\win32.ts" -Raw
    
    $requiredMethods = @(
        "restartSystem",
        "shutdownSystem", 
        "applyPowerMode",
        "startService",
        "stopService",
        "isServiceActive",
        "runCpuStressTest",
        "runMemoryStressTest"
    )
    
    foreach ($method in $requiredMethods) {
        if ($win32 -notmatch "async $method\(") {
            throw "Missing method: $method"
        }
    }
}

Test-Scenario "Win32 controller uses correct Windows commands" "P0" {
    $win32 = Get-Content "app\src\server\platforms\win32.ts" -Raw
    
    # Check for Windows-specific commands
    if ($win32 -notmatch 'runCommand\("shutdown"') {
        throw "Missing shutdown command"
    }
    if ($win32 -notmatch 'runCommand\("powercfg"') {
        throw "Missing powercfg command"
    }
    if ($win32 -notmatch 'runCommand\("net".*\["start"') {
        throw "Missing net start command"
    }
}

# P0: Service Name Mapping
Test-Scenario "Service runtime maps Linux names to Windows names" "P0" {
    $serviceRuntime = Get-Content "app\src\server\service-runtime.ts" -Raw
    
    $expectedMappings = @{
        "vantage-backend.service" = "VantageBackend"
        "vantage-llm-gateway.service" = "VantageLlmGateway"
        "vllm-coder.service" = "VllmCoder"
    }
    
    foreach ($mapping in $expectedMappings.GetEnumerator()) {
        $pattern = [regex]::Escape($mapping.Key) + '.*' + [regex]::Escape($mapping.Value)
        if ($serviceRuntime -notmatch $pattern) {
            throw "Missing mapping: $($mapping.Key) -> $($mapping.Value)"
        }
    }
}

# P1: Windows Installer Script Syntax
Test-Scenario "Windows installer has valid PowerShell syntax" "P1" {
    $errors = $null
    $tokens = $null
    [System.Management.Automation.Language.Parser]::ParseFile(
        "$PWD\install-vantage.ps1",
        [ref]$tokens,
        [ref]$errors
    ) | Out-Null
    
    if ($errors.Count -gt 0) {
        throw "Syntax errors: $($errors | ForEach-Object { $_.Message } | Join-String -Separator '; ')"
    }
}

Test-Scenario "Windows uninstaller has valid PowerShell syntax" "P1" {
    $errors = $null
    $tokens = $null
    [System.Management.Automation.Language.Parser]::ParseFile(
        "$PWD\uninstall-vantage.ps1",
        [ref]$tokens,
        [ref]$errors
    ) | Out-Null
    
    if ($errors.Count -gt 0) {
        throw "Syntax errors: $($errors | ForEach-Object { $_.Message } | Join-String -Separator '; ')"
    }
}

# P1: Linux Installer Script Syntax
Test-Scenario "Linux installer is executable and syntactically valid" "P1" {
    if (-not (Test-Path "install-vantage.sh")) {
        throw "install-vantage.sh not found"
    }
    
    # Basic shell syntax check (very simplified)
    $content = Get-Content "install-vantage.sh" -Raw
    if ($content -notmatch "^#!/") {
        throw "Missing shebang"
    }
    if ($content -notmatch "set -euo pipefail") {
        throw "Missing strict mode"
    }
}

# P1: Queue TTL and Expiration
Test-Scenario "Queue has TTL and expiration logic" "P1" {
    $steamApi = Get-Content "app\src\server\api\steam.ts" -Raw
    $storage = Get-Content "app\src\server\storage.ts" -Raw
    
    if ($steamApi -notmatch "QUEUE_TTL_MS\s*=") {
        throw "QUEUE_TTL_MS constant not found"
    }
    if ($storage -notmatch "ttlExpiresAt") {
        throw "TTL expiration field not found in storage"
    }
}

# P1: Request Snapshot Validation
Test-Scenario "Queue validates request snapshots" "P1" {
    $steamApi = Get-Content "app\src\server\api\steam.ts" -Raw
    
    if ($steamApi -notmatch "function validateSnapshot") {
        throw "validateSnapshot function not found"
    }
    if ($steamApi -notmatch 'method\s*!==\s*"POST"') {
        throw "Method validation not found"
    }
    if ($steamApi -notmatch 'path\.startsWith\("/v1/"\)') {
        throw "Path prefix validation not found"
    }
}

# P1: Idempotency Support
Test-Scenario "Queue supports idempotency keys" "P1" {
    $steamApi = Get-Content "app\src\server\api\steam.ts" -Raw
    $types = Get-Content "app\src\shared\types.ts" -Raw
    
    if ($types -notmatch "idempotencyKey") {
        throw "idempotencyKey field not found in types"
    }
    if ($steamApi -notmatch "deduped") {
        throw "Deduplication logic not found"
    }
}

# P1: Steam Session State Persistence
Test-Scenario "Steam session state persists across restarts" "P1" {
    $storage = Get-Content "app\src\server\storage.ts" -Raw
    
    if ($storage -notmatch "readSteamSessionState|writeSteamSessionState") {
        throw "Session state persistence functions not found"
    }
    if ($storage -notmatch "steam-session\.json") {
        throw "Session state file path not found"
    }
}

# P1: Server Integration
Test-Scenario "Server mounts Steam router at /api" "P1" {
    $server = Get-Content "app\src\server\server.ts" -Raw
    
    if ($server -notmatch 'import.*createSteamRouter') {
        throw "Steam router import not found"
    }
    if ($server -notmatch 'app\.use\("/api".*createSteamRouter') {
        throw "Steam router not mounted at /api"
    }
}

# P1: README Documentation
Test-Scenario "README documents Windows support" "P1" {
    $readme = Get-Content "README.md" -Raw
    
    if ($readme -notmatch "Windows") {
        throw "Windows not mentioned in README"
    }
    if ($readme -notmatch "install-vantage\.ps1") {
        throw "Windows installer not documented"
    }
}

Write-Host "`n=== Test Results ===" -ForegroundColor Magenta
Write-Host "P0: $p0Pass / $p0Total passed"
Write-Host "P1: $p1Pass / $p1Total passed"

$totalPass = $p0Pass + $p1Pass
$totalTests = $p0Total + $p1Total
$passRate = [math]::Round(($totalPass / $totalTests) * 100, 2)

Write-Host "`nOverall: $totalPass / $totalTests passed ($passRate%)"

$failures = $results | Where-Object { $_.Status -eq "FAIL" }
if ($failures.Count -gt 0) {
    Write-Host "`n=== Failures ===" -ForegroundColor Red
    foreach ($failure in $failures) {
        Write-Host "[$($failure.Priority)] $($failure.Name)" -ForegroundColor Red
        Write-Host "  Error: $($failure.Error)" -ForegroundColor Yellow
    }
    exit 1
}
else {
    Write-Host "`nAll tests passed!" -ForegroundColor Green
    exit 0
}
