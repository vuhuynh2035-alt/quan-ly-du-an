# Menu deploy Firebase — don gian: chon so -> deploy
# Goi tu deploy.bat

param(
  [switch]$SkipPull,
  [switch]$FullDeploy,
  [switch]$Refresh,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ArgsRest
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deploy-lib.ps1")

function Invoke-FirstRunSetup {
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "  CAI DAT LAN DAU (chi 1 lan)" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan

  if (-not (Test-CommandExists "firebase")) {
    Write-Host "Dang cai firebase-tools..." -ForegroundColor Yellow
    npm install -g firebase-tools 2>&1 | Out-Host
    if (-not (Test-CommandExists "firebase")) {
      throw "Khong cai duoc firebase-tools. Cai Node.js roi chay lai deploy.bat"
    }
  }

  $emails = @(Get-FirebaseLoggedInEmails)
  if ($emails.Count -eq 0) {
    Write-Host ""
    Write-Host "Chua co tai khoan Firebase tren may nay." -ForegroundColor Yellow
    Write-Host "Se mo trinh duyet de dang nhap Google (co the them nhieu TK)." -ForegroundColor DarkGray
    Write-Host ""
    $go = Read-Host "Nhan Enter de dang nhap, hoac Q de thoat"
    if ($go -match '^[Qq]$') { exit 0 }
    Invoke-NativeCommand -AllowFail -Command { firebase login:add } | Out-Null
    $emails = @(Get-FirebaseLoggedInEmails)
    if ($emails.Count -eq 0) {
      throw "Chua dang nhap Firebase. Chay lai deploy.bat sau khi login thanh cong."
    }
  }

  Write-Host ""
  Write-Host "Tai khoan san sang:" -ForegroundColor Green
  foreach ($e in $emails) { Write-Host "  - $e" }

  if ($emails.Count -eq 1) {
    Write-Host ""
    Write-Host "Chi co 1 TK. Neu co app khac dung Google khac, bam M > Them tai khoan." -ForegroundColor DarkGray
  }
  Write-Host ""
}

function Show-SimpleMenu {
  param([object[]]$Apps, [object]$Config)

  Clear-Host
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "           DEPLOY APP" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "  Chon so -> tu dong doi TK + deploy" -ForegroundColor DarkGray
  Write-Host ""

  if (-not $Apps -or $Apps.Count -eq 0) {
    Write-Host "  Chua thay app Firebase nao." -ForegroundColor Yellow
    Write-Host "  Mo project trong Cursor roi bam R." -ForegroundColor DarkGray
  } else {
    $i = 1
    foreach ($app in $Apps) {
      $email = if ($app.accountEmail) { $app.accountEmail } else {
        $acc = Get-DeployAccount $Config $app
        if ($acc -and $acc.email) { $acc.email } else { "lan dau se hoi TK" }
      }
      Write-Host ("  {0,2}. {1}" -f $i, $app.label) -ForegroundColor White
      Write-Host ("      {0}" -f $email) -ForegroundColor DarkCyan
      $i++
    }
  }

  Write-Host ""
  Write-Host "   M  Them tuy chon (an app / them TK / ...)" -ForegroundColor DarkGray
  Write-Host "   Q  Thoat" -ForegroundColor DarkGray
  Write-Host ""
}

function Show-MoreMenu {
  Write-Host ""
  Write-Host "  --- Tuy chon ---" -ForegroundColor Yellow
  Write-Host "  A  Deploy tat ca"
  Write-Host "  X  An app khoi danh sach"
  Write-Host "  R  Quet lai Cursor"
  Write-Host "  L  Xem tai khoan Firebase"
  Write-Host "  T  Them tai khoan Firebase (login:add)"
  Write-Host "  E  Mo file cau hinh"
  Write-Host "  D  Tao shortcut tren Desktop"
  Write-Host "  B  Quay lai"
  Write-Host ""
}

function Show-SetupGuide {
  $root = Get-DeployRoot
  Write-Host ""
  Write-Host "Cach dung hang ngay:" -ForegroundColor Green
  Write-Host "  1. Double-click deploy.bat (hoac shortcut Desktop)"
  Write-Host "  2. Go so app"
  Write-Host "  3. Enter — xong"
  Write-Host ""
  Write-Host "Lan dau moi app: chon tai khoan Firebase 1 lan (se nho)."
  Write-Host "Thu muc tool: $root"
  Write-Host ""
  Show-FirebaseAccounts
}

function Open-ConfigEditor {
  $path = Get-DeployConfigPath ""
  if (-not (Test-Path $path)) {
    $example = Join-Path $PSScriptRoot "deploy-apps.config.example.json"
    Copy-Item $example $path
  }
  notepad $path
}

function New-DesktopShortcut {
  $root = Get-DeployRoot
  $bat = Join-Path $root "deploy.bat"
  $desktop = [Environment]::GetFolderPath("Desktop")
  $lnkPath = Join-Path $desktop "Deploy App.lnk"
  $wsh = New-Object -ComObject WScript.Shell
  $lnk = $wsh.CreateShortcut($lnkPath)
  $lnk.TargetPath = $bat
  $lnk.WorkingDirectory = $root
  $lnk.WindowStyle = 1
  $lnk.Description = "Deploy Firebase — chon app"
  $lnk.Save()
  Write-Host "Da tao shortcut: $lnkPath" -ForegroundColor Green
  Write-Host "Lan sau chi can double-click 'Deploy App' tren Desktop." -ForegroundColor Green
}

function Resolve-Choice {
  param([object[]]$Apps, [string]$Choice)

  $c = $Choice.Trim()
  if ($c -eq "") { return $null }

  if ($c -match '^[Qq]$') { return @{ action = "quit" } }
  if ($c -match '^[Mm]$') { return @{ action = "more" } }
  if ($c -match '^[Aa]$') { return @{ action = "all" } }
  if ($c -match '^[Ee]$') { return @{ action = "edit" } }
  if ($c -match '^[Ll]$') { return @{ action = "list" } }
  if ($c -match '^[Ss]$') { return @{ action = "setup" } }
  if ($c -match '^[Rr]$') { return @{ action = "refresh" } }
  if ($c -match '^[Xx]$') { return @{ action = "exclude" } }
  if ($c -match '^[Tt]$') { return @{ action = "addAccount" } }
  if ($c -match '^[Dd]$') { return @{ action = "desktop" } }
  if ($c -match '^[Bb]$') { return @{ action = "back" } }

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

function Hide-AppInteractive {
  param([object[]]$Apps, [object]$Config)
  if (-not $Apps -or $Apps.Count -eq 0) {
    Write-Host "Khong co app de an." -ForegroundColor Yellow
    return
  }
  Write-Host ""
  Write-Host "Chon so app muon AN:" -ForegroundColor Cyan
  for ($i = 0; $i -lt $Apps.Count; $i++) {
    Write-Host ("  {0,2}. {1}" -f ($i + 1), $Apps[$i].label)
  }
  $pick = Read-Host "So (Enter = huy)"
  if ($pick -notmatch '^\d+$') { return }
  $idx = [int]$pick - 1
  if ($idx -lt 0 -or $idx -ge $Apps.Count) { return }
  $app = $Apps[$idx]
  $rule = if ($app.path) { [string]$app.path } else { [string]$app.label }
  Add-DeployExclude -Config $Config -Rule $rule
  Write-Host "Da an: $($app.label)" -ForegroundColor Green
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
  Write-Host "Deploy tat ca: THANH CONG" -ForegroundColor Green
}

try {
  # Lan dau: cai firebase + login neu thieu
  $needSetup = $false
  if (-not (Test-CommandExists "firebase")) { $needSetup = $true }
  elseif (@(Get-FirebaseLoggedInEmails).Count -eq 0) { $needSetup = $true }
  if ($needSetup) { Invoke-FirstRunSetup }

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
      "desktop" { New-DesktopShortcut; exit 0 }
      "addAccount" {
        Invoke-NativeCommand -AllowFail -Command { firebase login:add } | Out-Null
        exit 0
      }
      "exclude" {
        Hide-AppInteractive -Apps $apps -Config $config
        exit 0
      }
      "refresh" {
        $apps = @(Get-MergedDeployApps (Read-DeployConfig ""))
        Write-Host "Da quet lai: $($apps.Count) app" -ForegroundColor Green
        exit 0
      }
      "app" { Deploy-One -App $resolved.app -Config $config; exit 0 }
      default { exit 0 }
    }
  }

  while ($true) {
    Show-SimpleMenu $apps $config
    $input = Read-Host "Nhap so app"
    $resolved = Resolve-Choice $apps $input

    if (-not $resolved) {
      Write-Host "Nhap so trong danh sach, M, hoac Q." -ForegroundColor Red
      Start-Sleep -Seconds 1
      continue
    }

    switch ($resolved.action) {
      "quit" { exit 0 }
      "more" {
        Show-MoreMenu
        $more = Read-Host "Chon"
        $mr = Resolve-Choice $apps $more
        if (-not $mr -or $mr.action -eq "back") { continue }
        switch ($mr.action) {
          "all" {
            Deploy-All -Apps $apps -Config $config
            Read-Host "Enter de ve menu" | Out-Null
          }
          "exclude" {
            Hide-AppInteractive -Apps $apps -Config $config
            $config = Read-DeployConfig ""
            $apps = @(Get-MergedDeployApps $config)
          }
          "refresh" {
            $config = Read-DeployConfig ""
            $apps = @(Get-MergedDeployApps $config)
          }
          "list" { Show-FirebaseAccounts; Read-Host "Enter" | Out-Null }
          "addAccount" {
            Invoke-NativeCommand -AllowFail -Command { firebase login:add } | Out-Null
            Show-FirebaseAccounts
            Read-Host "Enter" | Out-Null
          }
          "edit" {
            Open-ConfigEditor
            $config = Read-DeployConfig ""
            $apps = @(Get-MergedDeployApps $config)
          }
          "desktop" { New-DesktopShortcut; Read-Host "Enter" | Out-Null }
          "setup" { Show-SetupGuide; Read-Host "Enter" | Out-Null }
          "quit" { exit 0 }
        }
      }
      "app" {
        try {
          Deploy-One -App $resolved.app -Config $config
        } catch {
          Write-Host ""
          Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
        }
        Write-Host ""
        Read-Host "Enter de ve menu chon app" | Out-Null
        $config = Read-DeployConfig ""
        $apps = @(Get-MergedDeployApps $config)
      }
    }
  }
} catch {
  Write-Host ""
  Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
