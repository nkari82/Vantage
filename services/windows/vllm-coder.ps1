$ErrorActionPreference = "Stop"

$composeFile = $env:VANTAGE_VLLM_COMPOSE_FILE
if ([string]::IsNullOrWhiteSpace($composeFile)) {
  throw "VANTAGE_VLLM_COMPOSE_FILE is required."
}

$installRoot = $env:VANTAGE_INSTALL_ROOT
if (-not [string]::IsNullOrWhiteSpace($installRoot)) {
  Set-Location $installRoot
}

& docker compose -f $composeFile up
exit $LASTEXITCODE
