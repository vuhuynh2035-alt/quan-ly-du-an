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
$apps = @(Get-MergedDeployApps $config)
$app = $apps | Where-Object { $_.id -eq $AppId } | Select-Object -First 1
if (-not $app) {
  # fallback: so thu tu 1-based
  if ($AppId -match '^\d+$') {
    $idx = [int]$AppId - 1
    if ($idx -ge 0 -and $idx -lt $apps.Count) { $app = $apps[$idx] }
  }
}
if (-not $app) {
  throw "Khong tim thay app '$AppId'. Chay deploy.bat de xem danh sach."
}

try {
  Invoke-AppDeploy -App $app -Config $config -SkipPull:$SkipPull -FullDeploy:$FullDeploy -Interactive
} catch {
  Write-Host ""
  Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
