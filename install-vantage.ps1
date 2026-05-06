param(
  [string]$ProjectRoot = (Resolve-Path $PSScriptRoot).Path,
  [string]$InstallRoot = "C:\opt\vantage",
  [switch]$SkipBuild,
  [switch]$WithSteamStreaming,
  [string]$NodeExe = "C:\Program Files\nodejs\node.exe",
  [string]$NssmExe = "nssm.exe"
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($currentIdentity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run install-vantage.ps1 from an elevated PowerShell session."
  }
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Ensure-Directory([string]$Path) {
  if (-not (Test-Path $Path)) {
    New-Item -ItemType Directory -Path $Path -Force | Out-Null
  }
}

function New-RandomToken([int]$Bytes = 32) {
  $buffer = New-Object byte[] $Bytes
  [Security.Cryptography.RandomNumberGenerator]::Fill($buffer)
  return ([Convert]::ToHexString($buffer)).ToLowerInvariant()
}

function New-PasswordHash([string]$Password) {
  $encodedPassword = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Password))
  $script = @'
const crypto = require("node:crypto");
const password = Buffer.from(process.argv[1], "base64").toString("utf8");
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 64);
process.stdout.write("scrypt$" + salt.toString("hex") + "$" + hash.toString("hex"));
'@
  return (& $NodeExe -e $script $encodedPassword)
}

function Invoke-NpmBuild([string]$WorkingDir, [string]$Label) {
  if ($SkipBuild) {
    Write-Host "[SKIP] $Label build skipped"
    return
  }

  Write-Host "[BUILD] $Label"
  Push-Location $WorkingDir
  try {
    if (Test-Path (Join-Path $WorkingDir "package-lock.json")) {
      npm ci
    }
    else {
      npm install
    }
    npm run build --if-present
  }
  finally {
    Pop-Location
  }
}

function Sync-ProjectTree([string]$Source, [string]$Destination) {
  Ensure-Directory $Destination
  robocopy $Source $Destination /MIR /XD node_modules .git .sisyphus dist | Out-Null
  $code = $LASTEXITCODE
  if ($code -gt 7) {
    throw "robocopy failed with exit code $code"
  }
}

function Install-ServiceWithNssm(
  [string]$Name,
  [string]$Description,
  [string]$AppDirectory,
  [string]$AppParameters,
  [string]$StdoutLog,
  [string]$StderrLog,
  [hashtable]$Environment,
  [string]$Executable = $NodeExe
) {
  & $NssmExe install $Name $Executable $AppParameters | Out-Null
  & $NssmExe set $Name AppDirectory $AppDirectory | Out-Null
  & $NssmExe set $Name Description $Description | Out-Null
  & $NssmExe set $Name Start SERVICE_AUTO_START | Out-Null
  & $NssmExe set $Name AppStdout $StdoutLog | Out-Null
  & $NssmExe set $Name AppStderr $StderrLog | Out-Null
  & $NssmExe set $Name AppRotateFiles 1 | Out-Null
  & $NssmExe set $Name AppRotateOnline 1 | Out-Null
  & $NssmExe set $Name AppRotateBytes 10485760 | Out-Null
  & $NssmExe set $Name AppEnvironmentExtra (($Environment.GetEnumerator() | ForEach-Object { "{0}={1}" -f $_.Key, $_.Value }) -join "`0") | Out-Null
  & $NssmExe restart $Name | Out-Null
}

function Ensure-FirewallRule([string]$DisplayName, [string]$Protocol, [int[]]$Ports) {
  if (-not (Get-NetFirewallRule -DisplayName $DisplayName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $DisplayName -Direction Inbound -Action Allow -Protocol $Protocol -LocalPort ($Ports -join ",") | Out-Null
  }
}

function Install-SteamStreamingStack([string]$SystemToken, [string]$EnvFilePath, [string]$HelpersDir) {
  $sunshineInstallerUrl = "https://github.com/LizardByte/Sunshine/releases/latest/download/Sunshine-Windows-AMD64-installer.exe"
  $steamInstallerUrl = "https://cdn.akamai.steamstatic.com/client/installer/SteamSetup.exe"
  Ensure-Directory $HelpersDir

  Write-Host "[steam] Manual install required for third-party binaries"
  Write-Host "[steam] Install Sunshine manually from: $sunshineInstallerUrl"
  Write-Host "[steam] Install Steam manually from: $steamInstallerUrl"
  Write-Host "[steam] The installer intentionally does not auto-run downloaded third-party installers with elevation."

  Ensure-FirewallRule -DisplayName "Vantage Sunshine TCP" -Protocol TCP -Ports @(47984,47989,47990,48010)
  Ensure-FirewallRule -DisplayName "Vantage Sunshine UDP" -Protocol UDP -Ports @(47998,47999,48000,48002,48010)

  @"
VANTAGE_HOST=http://127.0.0.1:18080
VANTAGE_TOKEN=$SystemToken
"@ | Set-Content -Path $EnvFilePath -Encoding ASCII

  $startScript = Join-Path $HelpersDir "vantage-steam-session-start.ps1"
  $endScript = Join-Path $HelpersDir "vantage-steam-session-end.ps1"

  @"
`$envFile = "$EnvFilePath"
Get-Content `$envFile | ForEach-Object {
  if (`$_ -match "^(?<k>[^=]+)=(?<v>.*)$") {
    [Environment]::SetEnvironmentVariable(`$matches.k, `$matches.v)
  }
}
Invoke-RestMethod -Method Post -Uri "`${env:VANTAGE_HOST}/api/steam/session/start" -Headers @{ Authorization = "Bearer `${env:VANTAGE_TOKEN}" } -ContentType "application/json" -Body "{}"
"@ | Set-Content -Path $startScript -Encoding UTF8

  @"
`$envFile = "$EnvFilePath"
Get-Content `$envFile | ForEach-Object {
  if (`$_ -match "^(?<k>[^=]+)=(?<v>.*)$") {
    [Environment]::SetEnvironmentVariable(`$matches.k, `$matches.v)
  }
}
Invoke-RestMethod -Method Post -Uri "`${env:VANTAGE_HOST}/api/steam/session/end" -Headers @{ Authorization = "Bearer `${env:VANTAGE_TOKEN}" } -ContentType "application/json" -Body "{}"
"@ | Set-Content -Path $endScript -Encoding UTF8

  Write-Host "[steam] Sunshine Web UI: https://localhost:47990"
  Write-Host "[steam] Pair Moonlight after opening Sunshine once."
}

Assert-Admin
Require-Command npm
Require-Command robocopy
Require-Command $NssmExe

if (-not (Test-Path $NodeExe)) {
  throw "Node executable not found: $NodeExe"
}
if (-not (Test-Path $ProjectRoot)) {
  throw "Project root not found: $ProjectRoot"
}

$envDir = Join-Path $InstallRoot "env"
$logsDir = Join-Path $InstallRoot "logs"
$helpersDir = Join-Path $InstallRoot "helpers"
$windowsServicesDir = Join-Path $InstallRoot "services\windows"
$backendEnv = Join-Path $envDir "backend.env"
$steamEnv = Join-Path $envDir "steam.env"
$vllmComposeFile = Join-Path $InstallRoot "services\vllm-container\docker-compose.yml"
$backendServiceScript = Join-Path $windowsServicesDir "vantage-backend.ps1"
$vllmServiceScript = Join-Path $windowsServicesDir "vllm-coder.ps1"
$gatewayServiceScript = Join-Path $windowsServicesDir "vantage-llm-gateway.ps1"
$ak620ServiceScript = Join-Path $windowsServicesDir "vantage-ak620-agent.ps1"
$adaptiveServiceScript = Join-Path $windowsServicesDir "vantage-adaptive-engine.ps1"
$systemAgentServiceScript = Join-Path $windowsServicesDir "vantage-system-agent.ps1"

Ensure-Directory $InstallRoot
Ensure-Directory $envDir
Ensure-Directory $logsDir
Ensure-Directory $helpersDir
Ensure-Directory $windowsServicesDir

Write-Host "[1/7] Sync project"
Sync-ProjectTree -Source $ProjectRoot -Destination $InstallRoot

Write-Host "[2/7] Build workspaces"
Invoke-NpmBuild -WorkingDir (Join-Path $InstallRoot "app") -Label "app"
Invoke-NpmBuild -WorkingDir (Join-Path $InstallRoot "services\llm-gateway") -Label "llm-gateway"
Invoke-NpmBuild -WorkingDir (Join-Path $InstallRoot "services\ak620-agent") -Label "ak620-agent"
Invoke-NpmBuild -WorkingDir (Join-Path $InstallRoot "services\adaptive-engine") -Label "adaptive-engine"
Invoke-NpmBuild -WorkingDir (Join-Path $InstallRoot "services\system-agent") -Label "system-agent"

Write-Host "[3/7] Write environment files"
$systemToken = New-RandomToken
$gatewayToken = New-RandomToken
$adminUsername = "admin"
$adminPassword = New-RandomToken -Bytes 18
$adminPasswordHash = New-PasswordHash -Password $adminPassword
@"
VANTAGE_SYSTEM_TOKEN=$systemToken
VANTAGE_LLM_GATEWAY_TOKEN=$gatewayToken
VANTAGE_ADMIN_USERNAME=$adminUsername
VANTAGE_ADMIN_PASSWORD_HASH=$adminPasswordHash
NODE_ENV=production
VANTAGE_BACKEND_PORT=18080
VANTAGE_CONFIG_PATH=$InstallRoot\app\config.json
VANTAGE_DASHBOARD_DIST=$InstallRoot\app\dist\client
VANTAGE_LOG_DIR=$logsDir
VANTAGE_VLLM_COMPOSE_FILE=$vllmComposeFile
"@ | Set-Content -Path $backendEnv -Encoding ASCII

Write-Host "[4/7] Install services"
Install-ServiceWithNssm -Name "VantageBackend" -Description "Vantage Backend Service" -AppDirectory $windowsServicesDir -AppParameters ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $backendServiceScript) -StdoutLog (Join-Path $logsDir "VantageBackend.log") -StderrLog (Join-Path $logsDir "VantageBackend.error.log") -Environment @{
  NODE_ENV = "production"
  VANTAGE_NODE_EXE = $NodeExe
  VANTAGE_INSTALL_ROOT = $InstallRoot
  VANTAGE_BACKEND_PORT = "18080"
  VANTAGE_CONFIG_PATH = (Join-Path $InstallRoot "app\config.json")
  VANTAGE_DASHBOARD_DIST = (Join-Path $InstallRoot "app\dist\client")
  VANTAGE_LOG_DIR = $logsDir
  VANTAGE_SYSTEM_TOKEN = $systemToken
  VANTAGE_LLM_GATEWAY_TOKEN = $gatewayToken
  VANTAGE_ADMIN_USERNAME = $adminUsername
  VANTAGE_ADMIN_PASSWORD_HASH = $adminPasswordHash
  VANTAGE_VLLM_COMPOSE_FILE = $vllmComposeFile
} -Executable "powershell.exe"
Install-ServiceWithNssm -Name "VllmCoder" -Description "Vantage vLLM Coder Service" -AppDirectory $windowsServicesDir -AppParameters ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $vllmServiceScript) -StdoutLog (Join-Path $logsDir "VllmCoder.log") -StderrLog (Join-Path $logsDir "VllmCoder.error.log") -Environment @{
  VANTAGE_INSTALL_ROOT = $InstallRoot
  VANTAGE_VLLM_COMPOSE_FILE = $vllmComposeFile
  VANTAGE_LOG_DIR = $logsDir
} -Executable "powershell.exe"
Install-ServiceWithNssm -Name "VantageLlmGateway" -Description "Vantage LLM Gateway Service" -AppDirectory $windowsServicesDir -AppParameters ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $gatewayServiceScript) -StdoutLog (Join-Path $logsDir "VantageLlmGateway.log") -StderrLog (Join-Path $logsDir "VantageLlmGateway.error.log") -Environment @{
  NODE_ENV = "production"
  VANTAGE_NODE_EXE = $NodeExe
  VANTAGE_INSTALL_ROOT = $InstallRoot
  VANTAGE_LLM_GATEWAY_PORT = "8080"
  VANTAGE_BACKEND_URL = "http://127.0.0.1:18080"
  VANTAGE_UPSTREAM_URL = "http://127.0.0.1:8000"
  VANTAGE_AUTO_START_VLLM = "true"
  VANTAGE_LLM_GATEWAY_TOKEN = $gatewayToken
  VANTAGE_LOG_DIR = $logsDir
} -Executable "powershell.exe"
Install-ServiceWithNssm -Name "VantageAk620Agent" -Description "Vantage AK620 Agent Service" -AppDirectory $windowsServicesDir -AppParameters ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $ak620ServiceScript) -StdoutLog (Join-Path $logsDir "VantageAk620Agent.log") -StderrLog (Join-Path $logsDir "VantageAk620Agent.error.log") -Environment @{
  NODE_ENV = "production"
  VANTAGE_NODE_EXE = $NodeExe
  VANTAGE_INSTALL_ROOT = $InstallRoot
  AK620_REFRESH_INTERVAL = "4"
  VANTAGE_LOG_DIR = $logsDir
} -Executable "powershell.exe"
Install-ServiceWithNssm -Name "VantageAdaptiveEngine" -Description "Vantage Adaptive Engine Service" -AppDirectory $windowsServicesDir -AppParameters ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $adaptiveServiceScript) -StdoutLog (Join-Path $logsDir "VantageAdaptiveEngine.log") -StderrLog (Join-Path $logsDir "VantageAdaptiveEngine.error.log") -Environment @{
  NODE_ENV = "production"
  VANTAGE_NODE_EXE = $NodeExe
  VANTAGE_INSTALL_ROOT = $InstallRoot
  VANTAGE_BACKEND_URL = "http://127.0.0.1:18080"
  VANTAGE_ADAPTIVE_POLL_MS = "15000"
  VANTAGE_LOG_DIR = $logsDir
} -Executable "powershell.exe"
Install-ServiceWithNssm -Name "VantageSystemAgent" -Description "Vantage System Agent Service" -AppDirectory $windowsServicesDir -AppParameters ("-NoProfile -ExecutionPolicy Bypass -File `"{0}`"" -f $systemAgentServiceScript) -StdoutLog (Join-Path $logsDir "VantageSystemAgent.log") -StderrLog (Join-Path $logsDir "VantageSystemAgent.error.log") -Environment @{
  NODE_ENV = "production"
  VANTAGE_NODE_EXE = $NodeExe
  VANTAGE_INSTALL_ROOT = $InstallRoot
  VANTAGE_SYSTEM_AGENT_PORT = "18081"
  VANTAGE_TRACKED_SERVICES = "vantage-backend.service,vantage-llm-gateway.service,vllm-coder.service,vantage-ak620-agent.service,vantage-adaptive-engine.service,vantage-system-agent.service"
  VANTAGE_LOG_DIR = $logsDir
} -Executable "powershell.exe"

Write-Host "[5/7] Open firewall"
Ensure-FirewallRule -DisplayName "Vantage Backend HTTP" -Protocol TCP -Ports @(18080)
Ensure-FirewallRule -DisplayName "Vantage LLM Gateway HTTP" -Protocol TCP -Ports @(8080)
Ensure-FirewallRule -DisplayName "Vantage System Agent HTTP" -Protocol TCP -Ports @(18081)

Write-Host "[6/7] Optional Steam streaming stack"
if ($WithSteamStreaming) {
  Install-SteamStreamingStack -SystemToken $systemToken -EnvFilePath $steamEnv -HelpersDir $helpersDir
}
else {
  Write-Host "[SKIP] Steam/Sunshine install skipped"
}

Write-Host "[7/7] Summary"
Write-Host "Installed to: $InstallRoot"
Write-Host "Backend: http://localhost:18080"
Write-Host "LLM Gateway: http://localhost:8080"
Write-Host "System Agent: http://localhost:18081"
Write-Host "Env file: $backendEnv"
Write-Host "Admin username: $adminUsername"
Write-Host "Admin password (save now): $adminPassword"
if ($WithSteamStreaming) {
  Write-Host "Steam helper start: $(Join-Path $helpersDir 'vantage-steam-session-start.ps1')"
  Write-Host "Steam helper end: $(Join-Path $helpersDir 'vantage-steam-session-end.ps1')"
}
