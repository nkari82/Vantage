# Steam Adaptive Queue/Replay QA Runner
# Automated test execution with service management

param(
    [switch]$SkipServiceStart = $false
)

$ErrorActionPreference = "Stop"

$BACKEND_PORT = 18080
$GATEWAY_PORT = 8080
$TEST_TOKEN = "test-token-12345"

Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "Steam Adaptive Queue/Replay QA Test Suite" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

# Check if services are already running
function Test-ServiceRunning {
    param([int]$Port)
    
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port/health" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

$backendRunning = Test-ServiceRunning -Port $BACKEND_PORT
$gatewayRunning = Test-ServiceRunning -Port $GATEWAY_PORT

Write-Host "Service Status Check:" -ForegroundColor Yellow
Write-Host "  Backend (port $BACKEND_PORT): $(if($backendRunning){'✓ RUNNING'}else{'✗ NOT RUNNING'})" -ForegroundColor $(if($backendRunning){'Green'}else{'Red'})
Write-Host "  Gateway (port $GATEWAY_PORT): $(if($gatewayRunning){'✓ RUNNING'}else{'✗ NOT RUNNING'})" -ForegroundColor $(if($gatewayRunning){'Green'}else{'Red'})
Write-Host ""

if (-not $backendRunning -or -not $gatewayRunning) {
    if ($SkipServiceStart) {
        Write-Host "ERROR: Services not running and -SkipServiceStart specified" -ForegroundColor Red
        Write-Host ""
        Write-Host "Please start services manually:" -ForegroundColor Yellow
        Write-Host "  Terminal 1: npm run dev:server -w app" -ForegroundColor Gray
        Write-Host "  Terminal 2: npm run dev -w services/llm-gateway" -ForegroundColor Gray
        exit 1
    }
    
    Write-Host "Services need to be started. Please run in separate terminals:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Terminal 1 (Backend):" -ForegroundColor Cyan
    Write-Host "  cd D:\Work\Vantage" -ForegroundColor Gray
    Write-Host "  `$env:VANTAGE_SYSTEM_TOKEN = `"$TEST_TOKEN`"" -ForegroundColor Gray
    Write-Host "  npm run dev:server -w app" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Terminal 2 (Gateway):" -ForegroundColor Cyan
    Write-Host "  cd D:\Work\Vantage" -ForegroundColor Gray
    Write-Host "  `$env:VANTAGE_SYSTEM_TOKEN = `"$TEST_TOKEN`"" -ForegroundColor Gray
    Write-Host "  `$env:VANTAGE_AUTO_START_VLLM = `"false`"" -ForegroundColor Gray
    Write-Host "  npm run dev -w services/llm-gateway" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Then re-run this script." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Waiting 30 seconds for services to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
    
    # Re-check
    $backendRunning = Test-ServiceRunning -Port $BACKEND_PORT
    $gatewayRunning = Test-ServiceRunning -Port $GATEWAY_PORT
    
    if (-not $backendRunning -or -not $gatewayRunning) {
        Write-Host "Services still not running. Exiting." -ForegroundColor Red
        exit 1
    }
}

Write-Host "✓ Services are running. Starting tests..." -ForegroundColor Green
Write-Host ""

# Set environment variables
$env:VANTAGE_SYSTEM_TOKEN = $TEST_TOKEN
$env:VANTAGE_BACKEND_URL = "http://127.0.0.1:$BACKEND_PORT"
$env:VANTAGE_GATEWAY_URL = "http://127.0.0.1:$GATEWAY_PORT"

# Run the test suite
Write-Host "Executing test suite..." -ForegroundColor Cyan
Write-Host ""

$testScriptPath = Join-Path $PSScriptRoot "qa-test-runner.mjs"

if (-not (Test-Path $testScriptPath)) {
    Write-Host "ERROR: Test runner not found at $testScriptPath" -ForegroundColor Red
    exit 1
}

try {
    node $testScriptPath
    $exitCode = $LASTEXITCODE
    
    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "==================================================================" -ForegroundColor Green
        Write-Host "QA TEST SUITE: PASSED" -ForegroundColor Green
        Write-Host "==================================================================" -ForegroundColor Green
    } else {
        Write-Host "==================================================================" -ForegroundColor Red
        Write-Host "QA TEST SUITE: FAILED" -ForegroundColor Red
        Write-Host "==================================================================" -ForegroundColor Red
    }
    
    Write-Host ""
    Write-Host "Evidence files location:" -ForegroundColor Yellow
    Write-Host "  D:\Work\Vantage\.sisyphus\evidence\" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Detailed report:" -ForegroundColor Yellow
    Write-Host "  D:\Work\Vantage\.sisyphus\evidence\qa-test-report.json" -ForegroundColor Gray
    Write-Host ""
    
    exit $exitCode
} catch {
    Write-Host ""
    Write-Host "ERROR: Test execution failed" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
