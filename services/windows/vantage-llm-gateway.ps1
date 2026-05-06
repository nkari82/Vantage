$ErrorActionPreference = "Stop"

$installRoot = $env:VANTAGE_INSTALL_ROOT
if ([string]::IsNullOrWhiteSpace($installRoot)) {
  throw "VANTAGE_INSTALL_ROOT is required."
}

$nodeExe = $env:VANTAGE_NODE_EXE
if ([string]::IsNullOrWhiteSpace($nodeExe)) {
  $nodeExe = "node.exe"
}

$entry = Join-Path $installRoot "services\llm-gateway\dist\index.js"
if (-not (Test-Path $entry)) {
  throw "LLM gateway entry not found: $entry"
}

& $nodeExe $entry
exit $LASTEXITCODE
