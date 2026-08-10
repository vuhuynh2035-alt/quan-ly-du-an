# =============================================================================
# deploy-auto.ps1 — Deploy 1 chạm cho Quan ly du an
# Luồng: commit local (nếu có) → fetch/pull/merge → push → kiểm tra → deploy full
# =============================================================================
param(
  [switch]$SkipCommit,
  [switch]$SkipPush,
  [switch]$HostingOnly,
  [string]$CommitMessage = "",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "deploy-lib.ps1")

function Write-Step {
  param([string]$Text)
  Write-Host ""
  Write-Host ">> $Text" -ForegroundColor Cyan
}

function Assert-Tools {
  foreach ($cmd in @("git", "node", "npm")) {
    if (-not (Test-CommandExists $cmd)) {
      throw "Thieu '$cmd'. Cai Git + Node.js roi chay lai."
    }
  }
  if (-not (Test-CommandExists "firebase")) {
    Write-Host "Chua co firebase-tools — dang cai..." -ForegroundColor Yellow
    Invoke-External -AllowFail -Command { npm install -g firebase-tools } | Out-Null
    if (-not (Test-CommandExists "firebase")) {
      throw "Cai firebase-tools that bai. Mo terminal moi roi chay lai."
    }
  }
}

function Test-AppSanity {
  param([string]$RepoRoot)
  $appJs = Join-Path $RepoRoot "js\app.js"
  $fallback = Join-Path $RepoRoot "index.html"
  $target = if (Test-Path -LiteralPath $appJs) { $appJs } else { $fallback }
  if (-not (Test-Path -LiteralPath $target)) {
    throw "Khong tim thay js\app.js hoac index.html"
  }
  $text = Get-Content -LiteralPath $target -Raw -Encoding UTF8
  if ($text -notmatch 'projView' -or $text -notmatch 'isProjLocked') {
    throw "$([IO.Path]::GetFileName($target)) thieu code Hoan thanh / khoa du an (projView / isProjLocked)."
  }
  Write-Host "OK — sanity: $([IO.Path]::GetFileName($target)) co projView + isProjLocked" -ForegroundColor Green
}

function Get-GitStatusPorcelain {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    return @(git status --porcelain 2>&1 | ForEach-Object { "$_" })
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Invoke-AutoCommit {
  param([string]$RepoRoot, [string]$Message)

  Push-Location -LiteralPath $RepoRoot
  try {
    $lines = @(Get-GitStatusPorcelain | Where-Object { $_ -and $_.Trim() -ne "" })
    if ($lines.Count -eq 0) {
      Write-Host "Working tree sach — khong can commit." -ForegroundColor DarkGray
      return $false
    }

    Write-Host "Co thay doi local:" -ForegroundColor Yellow
    foreach ($l in $lines) { Write-Host "  $l" -ForegroundColor DarkGray }

    # Stage tat ca (firebase-config.js / *.local da nam trong .gitignore)
    Invoke-External -FailMessage "git add that bai" -Command { git add -A } | Out-Null

    $staged = @(git diff --cached --name-only 2>&1 | ForEach-Object { "$_" } | Where-Object { $_ })
    if ($staged.Count -eq 0) {
      Write-Host "Khong co file duoc stage (co the chi la ignored) — bo qua commit." -ForegroundColor DarkGray
      return $false
    }

    $blocked = @($staged | Where-Object {
      $_ -match '(^|[\\/])\.env($|\.)' -or
      $_ -match 'firebase-config\.js$' -or
      $_ -match 'credentials\.json$' -or
      $_ -match 'serviceAccount.*\.json$' -or
      $_ -match '\.local(\.|$)'
    })
    if ($blocked.Count -gt 0) {
      git reset HEAD -- @($blocked) 2>&1 | Out-Null
      Write-Host "Bo qua file nhay cam khoi commit:" -ForegroundColor Yellow
      foreach ($b in $blocked) { Write-Host "  $b" -ForegroundColor DarkYellow }
      $staged = @(git diff --cached --name-only 2>&1 | ForEach-Object { "$_" } | Where-Object { $_ })
      if ($staged.Count -eq 0) {
        Write-Host "Chi con file nhay cam — khong commit." -ForegroundColor DarkGray
        return $false
      }
    }

    if (-not $Message) {
      $stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
      $Message = "Deploy tu dong — cap nhat truoc khi len Firebase ($stamp)"
    }

    $env:GIT_EDITOR = "true"
    $code = Invoke-External -AllowFail -Command { git commit -m $Message }
    if ($code -ne 0) {
      # Hook / empty commit
      $still = @(git diff --cached --name-only 2>&1)
      if ($still.Count -gt 0) { throw "git commit that bai (exit $code)" }
      Write-Host "Commit khong tao duoc (co the khong con thay doi)." -ForegroundColor DarkYellow
      return $false
    }
    Write-Host "Da commit: $Message" -ForegroundColor Green
    return $true
  } finally {
    Pop-Location
  }
}

function Invoke-GitSync {
  param([string]$RepoRoot, [string]$Branch, [switch]$DoPush)

  Push-Location -LiteralPath $RepoRoot
  try {
    Write-Host "git fetch origin $Branch ..." -ForegroundColor Yellow
    $fc = Invoke-External -AllowFail -Command { git fetch origin $Branch }
    if ($fc -ne 0) { throw "git fetch that bai (exit $fc)" }

    $cur = (git rev-parse --abbrev-ref HEAD 2>&1 | Out-String).Trim()
    if ($cur -ne $Branch) {
      Write-Host "Dang o '$cur' — checkout $Branch ..." -ForegroundColor Yellow
      # Stash neu can (da commit o buoc truoc; con untracked ignored)
      Invoke-External -FailMessage "git checkout that bai" -Command { git checkout $Branch } | Out-Null
    }

    Write-Host "git pull --ff-only origin $Branch ..." -ForegroundColor Yellow
    $pc = Invoke-External -AllowFail -Command { git pull --ff-only origin $Branch }
    if ($pc -ne 0) {
      Write-Host "Fast-forward khong duoc — thu merge ..." -ForegroundColor Yellow
      $mc = Invoke-External -AllowFail -Command { git pull --no-rebase origin $Branch }
      if ($mc -ne 0) {
        throw "git pull/merge that bai. Co conflict — mo Cursor giai quyet roi chay lai."
      }
      Write-Host "Merge xong." -ForegroundColor Green
    } else {
      Write-Host "Da cap nhat (fast-forward)." -ForegroundColor Green
    }

    if ($DoPush) {
      $ahead = 0
      try {
        $cnt = (git rev-list --count "origin/$Branch..HEAD" 2>&1 | Out-String).Trim()
        if ($cnt -match '^\d+$') { $ahead = [int]$cnt }
      } catch {}
      if ($ahead -gt 0) {
        Write-Host "Local ahead $ahead commit — git push ..." -ForegroundColor Yellow
        Invoke-External -FailMessage "git push that bai" -Command { git push -u origin HEAD } | Out-Null
        Write-Host "Da push len origin/$Branch." -ForegroundColor Green
      } else {
        Write-Host "Khong co commit local de push." -ForegroundColor DarkGray
      }
    }
  } finally {
    Pop-Location
  }
}

# ----- main -----

$root = Get-DeployRoot
Set-Location -LiteralPath $root

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  DEPLOY TU DONG — Quan ly du an" -ForegroundColor Cyan
Write-Host "  commit → pull/merge → push → deploy" -ForegroundColor DarkGray
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Thu muc: $root" -ForegroundColor DarkGray

try {
  Assert-Tools

  Write-Step "1/6 Kiem tra / commit thay doi local"
  if ($SkipCommit) {
    Write-Host "Bo qua commit (--SkipCommit)." -ForegroundColor DarkYellow
  } else {
    [void](Invoke-AutoCommit -RepoRoot $root -Message $CommitMessage)
  }

  Write-Step "2/6 Dong bo git (fetch / pull / merge)"
  Invoke-GitSync -RepoRoot $root -Branch $Branch -DoPush:(-not $SkipPush)

  Write-Step "3/6 Kiem tra code Hoan thanh / khoa du an"
  Test-AppSanity -RepoRoot $root

  Write-Step "4/6 Chuan bi npm / Firebase project"
  Ensure-Ready $root

  $projectId = Get-FirebaseProjectId $root
  if (-not $projectId) { $projectId = "quan-ly-du-an-7d651" }

  $config = Read-DeployConfig
  $apps = @(Get-DeployApps $config)
  $app = $apps | Where-Object {
    $_.firebaseProject -eq $projectId -or $_.id -eq "quan-ly-du-an"
  } | Select-Object -First 1
  if (-not $app) {
    $app = [pscustomobject]@{
      id = "quan-ly-du-an"; label = "Quan ly du an"; path = $root; branch = $Branch
      firebaseProject = $projectId; deploy = "all"
      siteUrl = "https://$projectId.web.app"
    }
  } else {
    $app.path = $root
    $app.firebaseProject = $projectId
  }

  $account = Resolve-AppAccount -App $app -Config $config
  if (-not $account) {
    # Lan dau / chua map TK — hoi 1 lan roi nho lai
    $account = Resolve-AppAccount -App $app -Config $config -Interactive
  }
  if ($account) {
    Write-Host "Firebase account: $($account.email)" -ForegroundColor DarkCyan
    if (-not (Invoke-FirebaseLoginUse -Email $account.email -AutoAdd)) {
      throw "Khong doi duoc sang $($account.email). Chay: firebase login --reauth"
    }
  }

  Use-FirebaseProject -ProjectId $projectId -Config $config -App $app -RepoRoot $root

  Write-Step $(if ($HostingOnly) { "5/6 Build + deploy HOSTING" } else { "5/6 Build + deploy HOSTING + FUNCTIONS" })
  $full = -not $HostingOnly
  $code = Invoke-DeployCommands -RepoRoot $root -Kind $(if ($full) { "all" } else { "hosting" }) -ProjectId $projectId -FullDeploy:$full
  if ($code -ne 0) { throw "Deploy that bai (exit $code)" }

  Write-Step "6/6 Xong"
  $ver = Get-VersionLabel $root
  $url = "https://$projectId.web.app"
  Write-Host ""
  Write-Host "========================================" -ForegroundColor Green
  Write-Host "  DEPLOY THANH CONG" -ForegroundColor Green
  if ($ver) { Write-Host "  Version: $ver" -ForegroundColor Green }
  Write-Host "  Site:    $url" -ForegroundColor Green
  Write-Host "  Mo app → Ctrl+F5 de tai ban moi" -ForegroundColor DarkGray
  Write-Host "========================================" -ForegroundColor Green
  exit 0
} catch {
  Write-Host ""
  Write-Host "[LOI] $($_.Exception.Message)" -ForegroundColor Red
  Write-Host "Deploy dung lai — sua loi roi chay lai Deploy-TuDong.bat" -ForegroundColor Yellow
  exit 1
}
