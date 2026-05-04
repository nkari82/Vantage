param(
  [string]$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [string]$InstallRoot = "C:\opt\vantage",
  [string]$NodeExe = "C:\Program Files\nodejs\node.exe",
  [string]$NssmExe = "nssm.exe"
)

$installer = Join-Path $PSScriptRoot "install-vantage.ps1"
if (-not (Test-Path $installer)) {
  throw "install-vantage.ps1 not found next to vantage-backend.ps1"
}

& $installer -ProjectRoot $ProjectRoot -InstallRoot $InstallRoot -NodeExe $NodeExe -NssmExe $NssmExe
