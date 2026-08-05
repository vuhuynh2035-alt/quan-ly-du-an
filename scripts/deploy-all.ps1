# Deploy tat ca app trong deploy-apps.config.json
# PowerShell: .\scripts\deploy-all.ps1

param(
  [string]$ConfigPath = "",
  [switch]$SkipPull,
  [switch]$FullDeploy
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deploy-lib.ps1")

$config = Read-DeployConfig $ConfigPath
$failed = @()

Write-Host ""
Write-Host "Deploy $($config.apps.Count) app..." -ForegroundColor Cyan

foreach ($app in $config.apps) {
  try {
    Invoke-AppDeploy -App $app -Config $config -SkipPull:$SkipPull -FullDeploy:$FullDeploy
  } catch {
    Write-Host "[LOI] $($app.label): $($_.Exception.Message)" -ForegroundColor Red
    $failed += $app.id
  }
  Write-Host ""
}

if ($failed.Count -eq 0) {
  Write-Host "Deploy tat ca app: THANH CONG" -ForegroundColor Green
  exit 0
}

Write-Host "Mot so app that bai: $($failed -join ', ')" -ForegroundColor Red
exit 1
