param(
  [string]$InstallRoot = "C:\opt\vantage",
  [string]$NssmExe = "nssm.exe"
)

$ErrorActionPreference = "Stop"

function Assert-Admin {
  $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($currentIdentity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run uninstall-vantage.ps1 from an elevated PowerShell session."
  }
}

function Remove-ServiceIfExists([string]$Name) {
  $service = Get-Service -Name $Name -ErrorAction SilentlyContinue
  if (-not $service) {
    return
  }

  try {
    Stop-Service -Name $Name -Force -ErrorAction SilentlyContinue
  }
  catch {
    Write-Warning "Failed to stop service '$Name' before removal: $($_.Exception.Message)"
  }

  & $NssmExe stop $Name | Out-Null
  & $NssmExe remove $Name confirm | Out-Null
}

Assert-Admin

$services = @(
  "VantageBackend",
  "VantageLlmGateway",
  "VantageAk620Agent",
  "VantageAdaptiveEngine",
  "VantageSystemAgent",
  "VllmCoder"
)

Write-Host "[1/3] Remove Windows services"
foreach ($service in $services) {
  Remove-ServiceIfExists -Name $service
}

Write-Host "[2/3] Remove firewall rules"
Get-NetFirewallRule -DisplayName "Vantage *" -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue

Write-Host "[3/3] Remove install directory"
if (Test-Path $InstallRoot) {
  Remove-Item -Path $InstallRoot -Recurse -Force
}

Write-Host "Windows uninstallation complete."
