# Vantage Backend Windows Service Installation Script (using NSSM)
# Prerequisites: NSSM (https://nssm.cc/) installed and in PATH

$ServiceName = "VantageBackend"
$AppPath = "C:\Program Files\nodejs\node.exe"
$AppArgs = "C:\opt\vantage\app\dist\server\server.js"
$WorkingDir = "C:\opt\vantage\app"

nssm install $ServiceName $AppPath $AppArgs
nssm set $ServiceName AppDirectory $WorkingDir
nssm set $ServiceName Description "Vantage Backend Service"
nssm set $ServiceName Start SERVICE_AUTO_START
nssm start $ServiceName

Write-Host "Vantage Backend Service installed and started."
