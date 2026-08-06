# Deploy tat ca
param([switch]$SkipPull, [switch]$FullDeploy)
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deploy-lib.ps1")
$config = Read-DeployConfig
$apps = @(Get-DeployApps $config)
$failed = @()
foreach ($app in $apps) {
  try {
    Invoke-AppDeploy -App $app -Config $config -SkipPull:$SkipPull -FullDeploy:$FullDeploy -Interactive
  } catch {
    Write-Host "[LOI] $($app.label): $($_.Exception.Message)" -ForegroundColor Red
    $failed += $app.label
  }
}
if ($failed.Count -gt 0) { Write-Host "That bai: $($failed -join ', ')" -ForegroundColor Red; exit 1 }
Write-Host "THANH CONG" -ForegroundColor Green
