# Menu chon app de deploy Firebase
# Goi tu deploy.bat hoac: powershell -File scripts\deploy-select.ps1

param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ArgsRest
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deploy-lib.ps1")

function Show-Menu {
  param([object]$Config)

  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "  DEPLOY FIREBASE — chon chuong trinh" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host ""

  $i = 1
  foreach ($app in $Config.apps) {
    $acc = Get-DeployAccount $Config $app
    $accLbl = if ($acc -and $acc.label) { " · $($acc.label)" } else { "" }
    Write-Host ("  {0,2}. {1}{2}" -f $i, $app.label, $accLbl)
    Write-Host ("      Project: {0} · branch: {1}" -f $app.firebaseProject, ($(if ($app.branch) { $app.branch } else { "main" }))) -ForegroundColor DarkGray
    $i++
  }

  Write-Host ""
  Write-Host "   A  Deploy TAT CA app trong danh sach" -ForegroundColor Yellow
  Write-Host "   E  Mo file cau hinh (deploy-apps.config.json)" -ForegroundColor DarkGray
  Write-Host "   Q  Thoat" -ForegroundColor DarkGray
  Write-Host ""
}

function Open-ConfigEditor {
  $path = Get-DeployConfigPath ""
  if (-not (Test-Path $path)) {
    $example = Join-Path $PSScriptRoot "deploy-apps.config.example.json"
    Copy-Item $example $path
    Write-Host "Da tao $path tu file mau." -ForegroundColor Green
  }
  notepad $path
}

function Resolve-Choice {
  param([object]$Config, [string]$Choice)

  $c = $Choice.Trim()
  if ($c -eq "") { return $null }

  if ($c -match '^[Qq]$') { return "quit" }
  if ($c -match '^[Aa]$') { return "all" }
  if ($c -match '^[Ee]$') { return "edit" }

  if ($c -match '^\d+$') {
    $idx = [int]$c - 1
    if ($idx -ge 0 -and $idx -lt $Config.apps.Count) {
      return $Config.apps[$idx].id
    }
  }

  $byId = $Config.apps | Where-Object { $_.id -eq $c } | Select-Object -First 1
  if ($byId) { return $byId.id }

  return $null
}

try {
  $config = Read-DeployConfig ""

  if ($ArgsRest -and $ArgsRest.Count -gt 0) {
    $choice = Resolve-Choice $config $ArgsRest[0]
    if (-not $choice -or $choice -eq "quit") {
      Write-Host "Lua chon khong hop le: $($ArgsRest[0])" -ForegroundColor Red
      exit 1
    }
    if ($choice -eq "all") {
      & (Join-Path $PSScriptRoot "deploy-all.ps1")
      exit $LASTEXITCODE
    }
    if ($choice -eq "edit") {
      Open-ConfigEditor
      exit 0
    }
    & (Join-Path $PSScriptRoot "deploy-app.ps1") -AppId $choice
    exit $LASTEXITCODE
  }

  while ($true) {
    Show-Menu $config
    $input = Read-Host "Chon so / A / E / Q"
    $choice = Resolve-Choice $config $input

    if (-not $choice) {
      Write-Host "Lua chon khong hop le." -ForegroundColor Red
      continue
    }
    if ($choice -eq "quit") { exit 0 }
    if ($choice -eq "edit") { Open-ConfigEditor; continue }
    if ($choice -eq "all") {
      & (Join-Path $PSScriptRoot "deploy-all.ps1")
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
      Read-Host "Enter de tiep tuc"
      continue
    }

    & (Join-Path $PSScriptRoot "deploy-app.ps1") -AppId $choice
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Read-Host "Enter de tiep tuc"
  }
} catch {
  Write-Host ""
  Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
