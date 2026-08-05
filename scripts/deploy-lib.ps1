# Ham dung chung cho deploy nhieu app Firebase

function Get-DeployRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-DeployConfigPath {
  param([string]$ConfigPath)
  if ($ConfigPath) { return $ConfigPath }
  $local = Join-Path $PSScriptRoot "deploy-apps.local.json"
  if (Test-Path $local) { return $local }
  return (Join-Path $PSScriptRoot "deploy-apps.config.json")
}

function Read-DeployConfig {
  param([string]$ConfigPath)
  $path = Get-DeployConfigPath $ConfigPath
  if (-not (Test-Path $path)) {
    throw "Khong tim thay config deploy: $path`nCopy deploy-apps.config.example.json -> deploy-apps.config.json"
  }
  $raw = Get-Content $path -Raw -Encoding UTF8
  return ($raw | ConvertFrom-Json)
}

function Resolve-AppPath {
  param([object]$App)
  $root = Get-DeployRoot
  $p = [string]$App.path
  if (-not $p -or $p.Trim() -eq "") { return $root }
  if ([System.IO.Path]::IsPathRooted($p)) {
    if (-not (Test-Path $p)) { throw "Duong dan app khong ton tai: $p" }
    return (Resolve-Path $p).Path
  }
  $joined = Join-Path $root $p
  if (-not (Test-Path $joined)) { throw "Khong tim thay thu muc app: $joined" }
  return (Resolve-Path $joined).Path
}

function Get-DeployAccount {
  param([object]$Config, [object]$App)
  if (-not $App.accountId) { return $null }
  return ($Config.accounts | Where-Object { $_.id -eq $App.accountId } | Select-Object -First 1)
}

function Invoke-FirebaseAccount {
  param([object]$Account)
  if (-not $Account -or -not $Account.email -or [string]$Account.email.Trim() -eq "") { return }
  Write-Host "Firebase account: $($Account.label) <$($Account.email)>" -ForegroundColor DarkCyan
  firebase login:use $Account.email 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Chua dang nhap account nay. Chay: firebase login:add" -ForegroundColor Yellow
    throw "firebase login:use that bai"
  }
}

function Invoke-FirebaseProject {
  param([string]$ProjectId)
  Write-Host "Firebase project: $ProjectId" -ForegroundColor DarkCyan
  firebase use $ProjectId 2>&1 | Out-Host
  if ($LASTEXITCODE -ne 0) {
    firebase use --add $ProjectId 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "firebase use that bai" }
  }
}

function Sync-GitBranch {
  param([string]$RepoRoot, [string]$Branch, [switch]$SkipPull)
  if ($SkipPull) {
    Write-Host "Bo qua git pull (--SkipPull)" -ForegroundColor DarkYellow
    return
  }
  if (-not (Test-Path (Join-Path $RepoRoot ".git"))) {
    Write-Host "Khong phai git repo — bo qua pull" -ForegroundColor DarkYellow
    return
  }
  Push-Location $RepoRoot
  try {
    Write-Host "Git fetch + pull origin $Branch..." -ForegroundColor Yellow
    git fetch origin $Branch 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "git fetch that bai" }
    git pull origin $Branch 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "git pull that bai — commit local hoac xung dot?" }
  } finally {
    Pop-Location
  }
}

function Get-AppVersionLabel {
  param([string]$RepoRoot)
  $verFile = Join-Path $RepoRoot "public\app-version.json"
  if (-not (Test-Path $verFile)) { return $null }
  try {
    $ver = Get-Content $verFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $build = [int]$ver.build
    return "v1.$('{0:d3}' -f $build)"
  } catch {
    return $null
  }
}

function Ensure-AppReady {
  param([string]$RepoRoot)
  if (-not (Test-Path (Join-Path $RepoRoot "package.json"))) {
    throw "Khong co package.json trong $RepoRoot"
  }
  $cfg = Join-Path $RepoRoot "public\firebase-config.js"
  if (-not (Test-Path $cfg)) {
    Write-Host ""
    Write-Host "THIEU public\firebase-config.js" -ForegroundColor Red
    Write-Host "  copy public\firebase-config.example.js public\firebase-config.js"
    Write-Host "  (roi dien FIREBASE_CONFIG + VAPID_KEY tu Firebase Console)"
    throw "Thieu firebase-config.js"
  }
  if (-not (Test-Path (Join-Path $RepoRoot "node_modules"))) {
    Write-Host "Chua co node_modules — npm install..." -ForegroundColor Yellow
    Push-Location $RepoRoot
    try {
      npm install 2>&1 | Out-Host
      if ($LASTEXITCODE -ne 0) { throw "npm install that bai" }
    } finally {
      Pop-Location
    }
  }
}

function Invoke-AppDeploy {
  param(
    [object]$App,
    [object]$Config,
    [switch]$SkipPull,
    [switch]$FullDeploy
  )

  $repoRoot = Resolve-AppPath $App
  $branch = if ($App.branch) { $App.branch } else { "main" }
  $account = Get-DeployAccount $Config $App

  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host " Deploy: $($App.label)" -ForegroundColor Cyan
  Write-Host " ID: $($App.id)" -ForegroundColor Cyan
  Write-Host " Thu muc: $repoRoot" -ForegroundColor Cyan
  Write-Host "========================================" -ForegroundColor Cyan

  Sync-GitBranch -RepoRoot $repoRoot -Branch $branch -SkipPull:$SkipPull

  $verBefore = Get-AppVersionLabel $repoRoot
  if ($verBefore) {
    Write-Host "Version tren Git (truoc build): $verBefore" -ForegroundColor Green
  }

  Ensure-AppReady $repoRoot

  Push-Location $repoRoot
  try {
    Invoke-FirebaseAccount $account
    Invoke-FirebaseProject $App.firebaseProject

    $deployKind = [string]$App.deploy
    if ($FullDeploy -or $deployKind -eq "all") {
      Write-Host "npm run deploy (full)..." -ForegroundColor Yellow
      npm run deploy 2>&1 | Out-Host
    } else {
      Write-Host "npm run deploy:hosting..." -ForegroundColor Yellow
      npm run deploy:hosting 2>&1 | Out-Host
    }
    if ($LASTEXITCODE -ne 0) { throw "npm deploy that bai" }
  } finally {
    Pop-Location
  }

  $verAfter = Get-AppVersionLabel $repoRoot
  $url = if ($App.siteUrl) { $App.siteUrl } else { "https://$($App.firebaseProject).web.app" }
  Write-Host ""
  Write-Host "XONG — $($App.label)" -ForegroundColor Green
  if ($verAfter) { Write-Host "  Version: $verAfter" -ForegroundColor Green }
  Write-Host "  Site: $url" -ForegroundColor Green
}
