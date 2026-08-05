# Menu chon app de deploy Firebase
# Goi tu deploy.bat hoac: powershell -File scripts\deploy-select.ps1

param(
  [switch]$SkipPull,
  [switch]$FullDeploy,
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
  Write-Host "   L  Xem tai khoan Firebase da dang nhap" -ForegroundColor DarkGray
  Write-Host "   E  Mo file cau hinh (deploy-apps.config.json)" -ForegroundColor DarkGray
  Write-Host "   S  Huong dan cau hinh lan dau" -ForegroundColor DarkGray
  Write-Host "   Q  Thoat" -ForegroundColor DarkGray
  Write-Host ""
}

function Show-SetupGuide {
  $root = Get-DeployRoot
  $cfgPath = Get-DeployConfigPath ""
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "  HUONG DAN CAU HINH DEPLOY" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Vi tri cong cu:" -ForegroundColor Green
  Write-Host "  $root\deploy.bat"
  Write-Host "  $root\scripts\deploy-select.ps1"
  Write-Host "  $cfgPath"
  Write-Host ""
  Write-Host "Buoc 1 — Cai dat (mot lan):" -ForegroundColor Yellow
  Write-Host "  npm install -g firebase-tools"
  Write-Host "  firebase login:add          (dang nhap Google Firebase)"
  Write-Host ""
  Write-Host "Buoc 2 — Sua config:" -ForegroundColor Yellow
  Write-Host "  Chon E trong menu, dien email vao accounts[].email"
  Write-Host "  Them app khac vao apps[] (path = thu muc repo, de trong = repo nay)"
  Write-Host ""
  Write-Host "Buoc 3 — Deploy:" -ForegroundColor Yellow
  Write-Host "  Double-click deploy.bat, chon so app"
  Write-Host "  Script tu dong: git pull -> build -> firebase hosting"
  Write-Host ""
  Write-Host "File rieng tren may (khong commit): scripts\deploy-apps.local.json"
  Write-Host ""
  Show-FirebaseAccounts
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
  if ($c -match '^[Ll]$') { return "list" }
  if ($c -match '^[Ss]$') { return "setup" }

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
  Test-DeployPrerequisites
  $config = Read-DeployConfig ""

  if ($ArgsRest -and $ArgsRest.Count -gt 0) {
    $choice = Resolve-Choice $config $ArgsRest[0]
    if (-not $choice -or $choice -eq "quit") {
      Write-Host "Lua chon khong hop le: $($ArgsRest[0])" -ForegroundColor Red
      exit 1
    }
    if ($choice -eq "all") {
      & (Join-Path $PSScriptRoot "deploy-all.ps1") -SkipPull:$SkipPull -FullDeploy:$FullDeploy
      exit $LASTEXITCODE
    }
    if ($choice -eq "edit") {
      Open-ConfigEditor
      exit 0
    }
    if ($choice -eq "list") {
      Show-FirebaseAccounts
      exit 0
    }
    if ($choice -eq "setup") {
      Show-SetupGuide
      exit 0
    }
    & (Join-Path $PSScriptRoot "deploy-app.ps1") -AppId $choice -SkipPull:$SkipPull -FullDeploy:$FullDeploy
    exit $LASTEXITCODE
  }

  while ($true) {
    Show-Menu $config
    $input = Read-Host "Chon so / A / L / E / S / Q"
    $choice = Resolve-Choice $config $input

    if (-not $choice) {
      Write-Host "Lua chon khong hop le." -ForegroundColor Red
      continue
    }
    if ($choice -eq "quit") { exit 0 }
    if ($choice -eq "edit") { Open-ConfigEditor; $config = Read-DeployConfig ""; continue }
    if ($choice -eq "list") { Show-FirebaseAccounts; Read-Host "Enter de tiep tuc"; continue }
    if ($choice -eq "setup") { Show-SetupGuide; Read-Host "Enter de tiep tuc"; continue }
    if ($choice -eq "all") {
      & (Join-Path $PSScriptRoot "deploy-all.ps1") -SkipPull:$SkipPull -FullDeploy:$FullDeploy
      if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
      Read-Host "Enter de tiep tuc"
      continue
    }

    & (Join-Path $PSScriptRoot "deploy-app.ps1") -AppId $choice -SkipPull:$SkipPull -FullDeploy:$FullDeploy
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Read-Host "Enter de tiep tuc"
  }
} catch {
  Write-Host ""
  Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
