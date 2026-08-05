# Deploy mot app: git pull -> npm build -> firebase hosting
# PowerShell: .\scripts\deploy-app.ps1 -AppId quan-ly-du-an

param(
  [Parameter(Mandatory = $true)]
  [string]$AppId,
  [string]$ConfigPath = "",
  [switch]$SkipPull,
  [switch]$FullDeploy
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deploy-lib.ps1")

$config = Read-DeployConfig $ConfigPath
$app = $config.apps | Where-Object { $_.id -eq $AppId } | Select-Object -First 1
if (-not $app) {
  throw "Khong tim thay app '$AppId'. Sua scripts\deploy-apps.config.json"
}

try {
  Invoke-AppDeploy -App $app -Config $config -SkipPull:$SkipPull -FullDeploy:$FullDeploy
} catch {
  Write-Host ""
  Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
