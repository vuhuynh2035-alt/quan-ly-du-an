# deploy-select.ps1 — Menu: go so app -> tu dong deploy
param(
  [switch]$SkipPull,
  [switch]$FullDeploy,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ArgsRest
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deploy-lib.ps1")

function Invoke-FirstRun {
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "  CAI DAT LAN DAU (chi 1 lan tren may)" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan

  if (-not (Test-CommandExists "node") -or -not (Test-CommandExists "npm")) {
    throw "Can cai Node.js: https://nodejs.org"
  }
  if (-not (Test-CommandExists "firebase")) {
    Write-Host "Dang cai firebase-tools..." -ForegroundColor Yellow
    Invoke-External -AllowFail -Command { npm install -g firebase-tools } | Out-Null
    if (-not (Test-CommandExists "firebase")) {
      throw "Cai firebase-tools that bai. Mo terminal moi roi chay lai."
    }
  }

  $emails = @(Get-FirebaseEmails)
  if ($emails.Count -eq 0) {
    Write-Host "Chua dang nhap Firebase. Mo trinh duyet de login..." -ForegroundColor Yellow
    $go = Read-Host "Enter = dang nhap, Q = thoat"
    if ($go -match '^[Qq]$') { exit 0 }
    Invoke-External -AllowFail -Command { firebase login:add } | Out-Null
    $emails = @(Get-FirebaseEmails)
    if ($emails.Count -eq 0) { throw "Chua login. Chay lai deploy.bat" }
  }

  Write-Host "San sang:" -ForegroundColor Green
  foreach ($e in $emails) { Write-Host "  - $e" }
  Write-Host "Them TK khac (neu can): M > T" -ForegroundColor DarkGray
  Write-Host ""
}

function Show-Menu {
  param([object[]]$Apps)
  Clear-Host
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "           DEPLOY APP" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host "  Go SO -> tu dong: doi TK + pull + build + deploy" -ForegroundColor DarkGray
  Write-Host ""

  if (-not $Apps -or $Apps.Count -eq 0) {
    Write-Host "  Chua thay app Firebase." -ForegroundColor Yellow
    Write-Host "  Mo project trong Cursor, roi M > R." -ForegroundColor DarkGray
  } else {
    $top = ($Apps | Measure-Object -Property rank -Maximum).Maximum
    $i = 1
    foreach ($app in $Apps) {
      $email = if ($app.accountEmail) { $app.accountEmail } else { "lan dau se hoi TK" }
      $mark = ""
      if ($app.rank -and $top -and ([int64]$app.rank -eq [int64]$top)) { $mark = "  << Cursor moi nhat" }
      Write-Host ("  {0,2}. {1}{2}" -f $i, $app.label, $mark) -ForegroundColor White
      Write-Host ("      {0}" -f $app.path) -ForegroundColor DarkGray
      Write-Host ("      {0}" -f $email) -ForegroundColor DarkCyan
      $i++
    }
  }
  Write-Host ""
  Write-Host "   M  Tuy chon" -ForegroundColor DarkGray
  Write-Host "   Q  Thoat" -ForegroundColor DarkGray
  Write-Host ""
}

function Show-More {
  Write-Host ""
  Write-Host "  A  Deploy tat ca"
  Write-Host "  X  An app khoi list"
  Write-Host "  R  Quet lai Cursor"
  Write-Host "  L  Xem tai khoan Firebase"
  Write-Host "  T  Them tai khoan Firebase"
  Write-Host "  E  Mo config"
  Write-Host "  D  Tao shortcut Desktop"
  Write-Host "  B  Quay lai"
  Write-Host ""
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
  $lnk.Description = "Deploy Firebase — chon app"
  $lnk.Save()
  Write-Host "Da tao: $lnkPath" -ForegroundColor Green
}

function Hide-App {
  param([object[]]$Apps, [object]$Config)
  if (-not $Apps -or $Apps.Count -eq 0) { return }
  Write-Host "Chon so app muon AN:" -ForegroundColor Cyan
  for ($i = 0; $i -lt $Apps.Count; $i++) {
    Write-Host ("  {0,2}. {1}" -f ($i + 1), $Apps[$i].label)
  }
  $pick = Read-Host "So (Enter = huy)"
  if ($pick -notmatch '^\d+$') { return }
  $idx = [int]$pick - 1
  if ($idx -lt 0 -or $idx -ge $Apps.Count) { return }
  Add-ExcludeRule -Config $Config -Rule ([string]$Apps[$idx].path)
  Write-Host "Da an: $($Apps[$idx].label)" -ForegroundColor Green
}

try {
  $need = (-not (Test-CommandExists "firebase")) -or (@(Get-FirebaseEmails).Count -eq 0)
  if ($need) { Invoke-FirstRun }

  $config = Read-DeployConfig
  $apps = @(Get-DeployApps $config)

  if ($ArgsRest -and $ArgsRest.Count -gt 0) {
    $c = "$($ArgsRest[0])".Trim()
    if ($c -match '^[Qq]$') { exit 0 }
    if ($c -match '^[Dd]$') { New-DesktopShortcut; exit 0 }
    if ($c -match '^\d+$') {
      $idx = [int]$c - 1
      if ($idx -ge 0 -and $idx -lt $apps.Count) {
        Invoke-AppDeploy -App $apps[$idx] -Config $config -SkipPull:$SkipPull -FullDeploy:$FullDeploy -Interactive
        exit 0
      }
    }
    Write-Host "Khong hieu: $c" -ForegroundColor Red
    exit 1
  }

  while ($true) {
    Show-Menu $apps
    $input = Read-Host "Nhap so app"
    $c = if ($null -eq $input) { "" } else { $input.Trim() }

    if ($c -match '^[Qq]$') { exit 0 }

    if ($c -match '^[Mm]$') {
      Show-More
      $m = (Read-Host "Chon").Trim()
      switch -Regex ($m) {
        '^[Aa]$' {
          foreach ($a in $apps) {
            try { Invoke-AppDeploy -App $a -Config $config -SkipPull:$SkipPull -FullDeploy:$FullDeploy -Interactive }
            catch { Write-Host "[LOI] $($a.label): $($_.Exception.Message)" -ForegroundColor Red }
          }
          Read-Host "Enter" | Out-Null
        }
        '^[Xx]$' {
          Hide-App -Apps $apps -Config $config
          $config = Read-DeployConfig
          $apps = @(Get-DeployApps $config)
        }
        '^[Rr]$' {
          $config = Read-DeployConfig
          $apps = @(Get-DeployApps $config)
          Write-Host "Da quet: $($apps.Count) app" -ForegroundColor Green
          Start-Sleep -Seconds 1
        }
        '^[Ll]$' { Show-FirebaseAccounts; Read-Host "Enter" | Out-Null }
        '^[Tt]$' {
          Invoke-External -AllowFail -Command { firebase login:add } | Out-Null
          Show-FirebaseAccounts
          Read-Host "Enter" | Out-Null
        }
        '^[Ee]$' {
          notepad (Get-DeployConfigPath)
          $config = Read-DeployConfig
          $apps = @(Get-DeployApps $config)
        }
        '^[Dd]$' { New-DesktopShortcut; Read-Host "Enter" | Out-Null }
      }
      continue
    }

    if ($c -match '^\d+$') {
      $idx = [int]$c - 1
      if ($idx -ge 0 -and $idx -lt $apps.Count) {
        try {
          Invoke-AppDeploy -App $apps[$idx] -Config $config -SkipPull:$SkipPull -FullDeploy:$FullDeploy -Interactive
        } catch {
          Write-Host ""
          Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
        }
        Write-Host ""
        Read-Host "Enter de ve menu" | Out-Null
        $config = Read-DeployConfig
        $apps = @(Get-DeployApps $config)
        continue
      }
    }

    Write-Host "Nhap so trong danh sach, M, hoac Q." -ForegroundColor Red
    Start-Sleep -Seconds 1
  }
} catch {
  Write-Host ""
  Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
