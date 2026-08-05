# Menu deploy Firebase — tu dong liet ke app tu Cursor + config
# Goi tu deploy.bat hoac: powershell -File scripts\deploy-select.ps1

param(
  [switch]$SkipPull,
  [switch]$FullDeploy,
  [switch]$Refresh,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ArgsRest
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deploy-lib.ps1")

function Show-Menu {
  param([object[]]$Apps, [object]$Config)

  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "  DEPLOY FIREBASE — chon chuong trinh" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "  Quet Cursor + thu muc gan Firebase" -ForegroundColor DarkGray
  Write-Host ""

  if (-not $Apps -or $Apps.Count -eq 0) {
    Write-Host "  (Khong tim thay app Firebase)" -ForegroundColor Yellow
    Write-Host "  Mo project trong Cursor, hoac them scanRoots / apps vao config." -ForegroundColor DarkGray
  } else {
    $i = 1
    foreach ($app in $Apps) {
      $email = if ($app.accountEmail) { $app.accountEmail } else {
        $acc = Get-DeployAccount $Config $app
        if ($acc -and $acc.email) { $acc.email } else { "(chua gan TK)" }
      }
      $proj = if ($app.firebaseProject) { $app.firebaseProject } else { "?" }
      $src = if ($app.source) { $app.source } else { "config" }
      Write-Host ("  {0,2}. {1}" -f $i, $app.label) -ForegroundColor White
      Write-Host ("      {0}" -f $app.path) -ForegroundColor DarkGray
      Write-Host ("      Firebase: {0}  |  Account: {1}  |  {2}" -f $proj, $email, $src) -ForegroundColor DarkCyan
      $i++
    }
  }

  Write-Host ""
  Write-Host "   A  Deploy TAT CA app trong danh sach" -ForegroundColor Yellow
  Write-Host "   R  Quet lai thu muc Cursor" -ForegroundColor DarkGray
  Write-Host "   L  Xem tai khoan Firebase da dang nhap" -ForegroundColor DarkGray
  Write-Host "   E  Mo file cau hinh (account / scanRoots)" -ForegroundColor DarkGray
  Write-Host "   S  Huong dan cau hinh lan dau" -ForegroundColor DarkGray
  Write-Host "   Q  Thoat" -ForegroundColor DarkGray
  Write-Host ""
}

function Show-SetupGuide {
  $root = Get-DeployRoot
  $cfgPath = Get-DeployConfigPath ""
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "  HUONG DAN — DEPLOY NHIEU APP / TK" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host ""
  Write-Host "Vi tri cong cu:" -ForegroundColor Green
  Write-Host "  $root\deploy.bat"
  Write-Host "  Config: $cfgPath"
  Write-Host "  (mapping email luu vao scripts\deploy-apps.local.json)"
  Write-Host ""
  Write-Host "Buoc 1 — Cai dat (mot lan):" -ForegroundColor Yellow
  Write-Host "  npm install -g firebase-tools"
  Write-Host "  firebase login:add     # lap lai cho MOI tai khoan Google"
  Write-Host ""
  Write-Host "Buoc 2 — Mo cac project trong Cursor (de tool nhin thay)" -ForegroundColor Yellow
  Write-Host "  Tool tu doc %APPDATA%\Cursor\User\workspaceStorage"
  Write-Host "  Chi hien app co firebase.json / .firebaserc"
  Write-Host ""
  Write-Host "Buoc 3 — Deploy:" -ForegroundColor Yellow
  Write-Host "  Double-click deploy.bat -> chon so"
  Write-Host "  Lan dau: chon tai khoan Firebase (se nho lai)"
  Write-Host "  Sau do tu dong: doi TK -> git pull -> build -> hosting"
  Write-Host ""
  Write-Host "Tuy chon: them scanRoots trong config de quet them thu muc." -ForegroundColor DarkGray
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
  param([object[]]$Apps, [string]$Choice)

  $c = $Choice.Trim()
  if ($c -eq "") { return $null }

  if ($c -match '^[Qq]$') { return @{ action = "quit" } }
  if ($c -match '^[Aa]$') { return @{ action = "all" } }
  if ($c -match '^[Ee]$') { return @{ action = "edit" } }
  if ($c -match '^[Ll]$') { return @{ action = "list" } }
  if ($c -match '^[Ss]$') { return @{ action = "setup" } }
  if ($c -match '^[Rr]$') { return @{ action = "refresh" } }

  if ($c -match '^\d+$') {
    $idx = [int]$c - 1
    if ($idx -ge 0 -and $idx -lt $Apps.Count) {
      return @{ action = "app"; app = $Apps[$idx] }
    }
  }

  $byId = $Apps | Where-Object { $_.id -eq $c } | Select-Object -First 1
  if ($byId) { return @{ action = "app"; app = $byId } }

  return $null
}

function Deploy-One {
  param([object]$App, [object]$Config)
  Invoke-AppDeploy -App $App -Config $Config -SkipPull:$SkipPull -FullDeploy:$FullDeploy -Interactive
}

function Deploy-All {
  param([object[]]$Apps, [object]$Config)
  $failed = @()
  foreach ($app in $Apps) {
    try {
      Deploy-One -App $app -Config $Config
    } catch {
      Write-Host "[LOI] $($app.label): $($_.Exception.Message)" -ForegroundColor Red
      $failed += $app.label
    }
  }
  if ($failed.Count -gt 0) {
    throw ("Mot so app that bai: {0}" -f ($failed -join ", "))
  }
  Write-Host "Deploy tat ca app: THANH CONG" -ForegroundColor Green
}

try {
  Test-DeployPrerequisites
  $config = Read-DeployConfig ""
  $apps = @(Get-MergedDeployApps $config)

  if ($ArgsRest -and $ArgsRest.Count -gt 0) {
    $resolved = Resolve-Choice $apps $ArgsRest[0]
    if (-not $resolved) {
      Write-Host "Lua chon khong hop le: $($ArgsRest[0])" -ForegroundColor Red
      exit 1
    }
    switch ($resolved.action) {
      "quit" { exit 0 }
      "all" { Deploy-All -Apps $apps -Config $config; exit 0 }
      "edit" { Open-ConfigEditor; exit 0 }
      "list" { Show-FirebaseAccounts; exit 0 }
      "setup" { Show-SetupGuide; exit 0 }
      "refresh" {
        $apps = @(Get-MergedDeployApps (Read-DeployConfig ""))
        Write-Host "Da quet lai: $($apps.Count) app" -ForegroundColor Green
        exit 0
      }
      "app" { Deploy-One -App $resolved.app -Config $config; exit 0 }
    }
  }

  while ($true) {
    Show-Menu $apps $config
    $input = Read-Host "Chon so / A / R / L / E / S / Q"
    $resolved = Resolve-Choice $apps $input

    if (-not $resolved) {
      Write-Host "Lua chon khong hop le." -ForegroundColor Red
      continue
    }

    switch ($resolved.action) {
      "quit" { exit 0 }
      "edit" {
        Open-ConfigEditor
        $config = Read-DeployConfig ""
        $apps = @(Get-MergedDeployApps $config)
      }
      "list" { Show-FirebaseAccounts; Read-Host "Enter de tiep tuc" | Out-Null }
      "setup" { Show-SetupGuide; Read-Host "Enter de tiep tuc" | Out-Null }
      "refresh" {
        $config = Read-DeployConfig ""
        $apps = @(Get-MergedDeployApps $config)
        Write-Host "Da quet lai: $($apps.Count) app Firebase" -ForegroundColor Green
        Start-Sleep -Seconds 1
      }
      "all" {
        Deploy-All -Apps $apps -Config $config
        Read-Host "Enter de tiep tuc" | Out-Null
      }
      "app" {
        Deploy-One -App $resolved.app -Config $config
        Read-Host "Enter de tiep tuc" | Out-Null
      }
    }
  }
} catch {
  Write-Host ""
  Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
