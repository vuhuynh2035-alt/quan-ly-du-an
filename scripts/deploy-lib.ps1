# Ham dung chung cho deploy nhieu app Firebase
# Tu dong quet thu muc du an Cursor + chuyen tai khoan Firebase theo app

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

# Git/npm/firebase viet nhieu thong bao ra stderr — PS coi la loi neu ErrorAction=Stop.
# Ham nay chi that bai khi exit code != 0.
function Invoke-NativeCommand {
  param(
    [Parameter(Mandatory = $true)]
    [scriptblock]$Command,
    [string]$FailMessage = "Lenh that bai",
    [switch]$AllowFail
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $Command 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) {
        Write-Host $_.ToString()
      } else {
        Write-Host $_
      }
    }
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $prev
  }
  if (-not $AllowFail -and $null -ne $code -and $code -ne 0) {
    throw "$FailMessage (exit $code)"
  }
  return $code
}

function Test-DeployPrerequisites {
  $missing = @()
  foreach ($cmd in @("git", "node", "npm", "firebase")) {
    if (-not (Test-CommandExists $cmd)) { $missing += $cmd }
  }
  if ($missing.Count -gt 0) {
    throw ("Thieu lenh tren PATH: {0}. Cai Node.js + Firebase CLI (npm i -g firebase-tools)." -f ($missing -join ", "))
  }
}

function Get-FirebaseLoggedInEmails {
  $lines = @(firebase login:list 2>&1)
  if ($LASTEXITCODE -ne 0) { return @() }
  $emails = @()
  foreach ($line in $lines) {
    $s = [string]$line
    if ($s -match '([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})') {
      $emails += $Matches[1]
    }
  }
  return ($emails | Select-Object -Unique)
}

function Show-FirebaseAccounts {
  Write-Host ""
  Write-Host "Tai khoan Firebase da dang nhap tren may nay:" -ForegroundColor Cyan
  $emails = Get-FirebaseLoggedInEmails
  if ($emails.Count -eq 0) {
    Write-Host "  (chua co — chay: firebase login:add)" -ForegroundColor Yellow
    return
  }
  foreach ($e in $emails) { Write-Host "  - $e" }
  Write-Host ""
  Write-Host "Them tai khoan: firebase login:add" -ForegroundColor DarkGray
}

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

function Ensure-DeployConfig {
  param([string]$ConfigPath)
  $path = Get-DeployConfigPath $ConfigPath
  if (Test-Path $path) { return $path }
  $example = Join-Path $PSScriptRoot "deploy-apps.config.example.json"
  if (-not (Test-Path $example)) {
    throw "Khong tim thay config deploy: $path"
  }
  Copy-Item $example $path
  Write-Host "Da tao $path tu file mau." -ForegroundColor Green
  return $path
}

function Read-DeployConfig {
  param([string]$ConfigPath)
  $path = Ensure-DeployConfig $ConfigPath
  $raw = Get-Content $path -Raw -Encoding UTF8
  $cfg = $raw | ConvertFrom-Json
  if (-not $cfg.accounts) { $cfg | Add-Member -NotePropertyName accounts -NotePropertyValue @() -Force }
  if (-not $cfg.apps) { $cfg | Add-Member -NotePropertyName apps -NotePropertyValue @() -Force }
  if (-not $cfg.PSObject.Properties["accountByPath"]) {
    $cfg | Add-Member -NotePropertyName accountByPath -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  if (-not $cfg.PSObject.Properties["discoverCursor"]) {
    $cfg | Add-Member -NotePropertyName discoverCursor -NotePropertyValue $true -Force
  }
  if (-not $cfg.PSObject.Properties["scanRoots"]) {
    $cfg | Add-Member -NotePropertyName scanRoots -NotePropertyValue @() -Force
  }
  if (-not $cfg.PSObject.Properties["exclude"]) {
    $cfg | Add-Member -NotePropertyName exclude -NotePropertyValue @() -Force
  }

  # Neu dang dung local.json, gop them exclude mac dinh tu config.json
  $shared = Join-Path $PSScriptRoot "deploy-apps.config.json"
  if ((Test-Path $shared) -and ($path -ne $shared)) {
    try {
      $base = Get-Content $shared -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($base.exclude) {
        $merged = @()
        if ($cfg.exclude) { $merged = @($cfg.exclude) }
        foreach ($r in @($base.exclude)) {
          if ($r -and -not ($merged | Where-Object { [string]$_ -eq [string]$r })) {
            $merged += $r
          }
        }
        $cfg | Add-Member -NotePropertyName exclude -NotePropertyValue $merged -Force
      }
    } catch {}
  }
  return $cfg
}

function Save-DeployConfig {
  param([object]$Config, [string]$ConfigPath = "")
  $path = Get-DeployConfigPath $ConfigPath
  # Luu vao local neu dang dung config chung — tranh commit email ca nhan
  if ($path -notmatch 'deploy-apps\.local\.json$') {
    $local = Join-Path $PSScriptRoot "deploy-apps.local.json"
    $path = $local
  }
  $json = $Config | ConvertTo-Json -Depth 8
  [System.IO.File]::WriteAllText($path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
  Write-Host "Da luu cau hinh: $path" -ForegroundColor DarkGray
  return $path
}

function ConvertFrom-FileUri {
  param([string]$Uri)
  if (-not $Uri) { return $null }
  $u = $Uri.Trim()
  if ($u -match '^file:///') {
    $path = [System.Uri]::UnescapeDataString(($u -replace '^file:///', ''))
    if ($path -match '^[A-Za-z]:') { return $path -replace '/', '\' }
    if ($IsLinux -or $IsMacOS) { return "/" + ($path -replace '\\', '/') }
    return $path -replace '/', '\'
  }
  if ($u -match '^file://') {
    return [System.Uri]::UnescapeDataString(($u -replace '^file://', ''))
  }
  return $u
}

function Get-CursorUserDataRoots {
  $roots = @()
  if ($env:APPDATA) {
    $roots += (Join-Path $env:APPDATA "Cursor\User")
    $roots += (Join-Path $env:APPDATA "Cursor - Insiders\User")
  }
  if ($env:HOME) {
    $roots += (Join-Path $env:HOME ".config/Cursor/User")
    $roots += (Join-Path $env:HOME "Library/Application Support/Cursor/User")
  }
  if ($env:USERPROFILE) {
    $roots += (Join-Path $env:USERPROFILE ".cursor")
  }
  return ($roots | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique)
}

function Get-CursorRecentFolders {
  $found = [System.Collections.Generic.List[string]]::new()
  $add = {
    param($p)
    if (-not $p) { return }
    $p = [string]$p
    if ($p -match '^file:') { $p = ConvertFrom-FileUri $p }
    try {
      if (Test-Path -LiteralPath $p -PathType Container) {
        $resolved = (Resolve-Path -LiteralPath $p).Path
        if (-not $found.Contains($resolved)) { $found.Add($resolved) }
      }
    } catch {}
  }

  foreach ($userRoot in (Get-CursorUserDataRoots)) {
    # workspaceStorage/*/workspace.json
    $wsRoot = Join-Path $userRoot "workspaceStorage"
    if (Test-Path $wsRoot) {
      Get-ChildItem -Path $wsRoot -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $wj = Join-Path $_.FullName "workspace.json"
        if (Test-Path $wj) {
          try {
            $data = Get-Content $wj -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($data.folder) { & $add $data.folder }
            if ($data.workspace) { & $add $data.workspace }
          } catch {}
        }
      }
    }

    # globalStorage/storage.json — recent folders
    $storage = Join-Path $userRoot "globalStorage\storage.json"
    if (-not (Test-Path $storage)) { $storage = Join-Path $userRoot "globalStorage/storage.json" }
    if (Test-Path $storage) {
      try {
        $raw = Get-Content $storage -Raw -Encoding UTF8
        # folderUri / file:/// paths
        [regex]::Matches($raw, 'file:///[^\s"\\]+') | ForEach-Object {
          & $add $_.Value
        }
      } catch {}
    }
  }

  return @($found)
}

function Get-FirebaseProjectId {
  param([string]$RepoRoot)
  $rc = Join-Path $RepoRoot ".firebaserc"
  if (Test-Path $rc) {
    try {
      $data = Get-Content $rc -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($data.projects.default) { return [string]$data.projects.default }
      $props = $data.projects.PSObject.Properties
      if ($props -and $props.Count -gt 0) { return [string]$props[0].Value }
    } catch {}
  }
  return $null
}

function Test-IsFirebaseApp {
  param([string]$RepoRoot)
  if (-not (Test-Path (Join-Path $RepoRoot "package.json"))) { return $false }
  if (Test-Path (Join-Path $RepoRoot "firebase.json")) { return $true }
  if (Test-Path (Join-Path $RepoRoot ".firebaserc")) { return $true }
  return $false
}

function Get-ScanRootFolders {
  param([object]$Config)
  $folders = [System.Collections.Generic.List[string]]::new()
  $add = {
    param($p)
    if (-not $p) { return }
    try {
      if (Test-Path -LiteralPath $p -PathType Container) {
        $resolved = (Resolve-Path -LiteralPath $p).Path
        if (-not $folders.Contains($resolved)) { $folders.Add($resolved) }
      }
    } catch {}
  }

  # Cac thu muc con truc tiep trong scanRoots
  if ($Config.scanRoots) {
    foreach ($root in $Config.scanRoots) {
      & $add $root
      if (Test-Path -LiteralPath $root) {
        Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          & $add $_.FullName
        }
      }
    }
  }

  # Sibling folders (cung cha voi repo deploy tool)
  $parent = Split-Path (Get-DeployRoot) -Parent
  if ($parent -and (Test-Path $parent)) {
    Get-ChildItem -LiteralPath $parent -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      & $add $_.FullName
    }
  }

  return @($folders)
}

function New-AppFromPath {
  param(
    [string]$Path,
    [object]$Config,
    [string]$Source = "cursor"
  )
  $name = Split-Path $Path -Leaf
  $id = ($name -replace '[^a-zA-Z0-9\-]+', '-').ToLower()
  if (-not $id) { $id = "app" }

  $projectId = Get-FirebaseProjectId $Path
  $email = $null
  if ($Config.accountByPath) {
    $prop = $Config.accountByPath.PSObject.Properties | Where-Object {
      try { (Resolve-Path -LiteralPath $_.Name -ErrorAction SilentlyContinue).Path -eq $Path } catch { $false }
    } | Select-Object -First 1
    if (-not $prop) {
      $prop = $Config.accountByPath.PSObject.Properties | Where-Object { $_.Name -eq $Path } | Select-Object -First 1
    }
    if ($prop) { $email = [string]$prop.Value }
  }

  $accId = $null
  if ($email -and $Config.accounts) {
    $acc = $Config.accounts | Where-Object { $_.email -eq $email } | Select-Object -First 1
    if ($acc) { $accId = $acc.id }
  }

  return [pscustomobject]@{
    id               = $id
    label            = $name
    path             = $Path
    branch           = "main"
    firebaseProject  = $(if ($projectId) { $projectId } else { "" })
    accountId        = $accId
    accountEmail     = $email
    deploy           = "hosting"
    siteUrl          = $(if ($projectId) { "https://$projectId.web.app" } else { "" })
    source           = $Source
  }
}

function Test-AppExcluded {
  param(
    [object]$App,
    [object]$Config
  )
  $rules = @()
  if ($Config.exclude) { $rules = @($Config.exclude) }
  if ($rules.Count -eq 0) { return $false }

  $path = if ($App.path) { [string]$App.path } else { "" }
  $id = if ($App.id) { [string]$App.id } else { "" }
  $label = if ($App.label) { [string]$App.label } else { "" }
  $leaf = if ($path) { Split-Path $path -Leaf } else { "" }
  $project = if ($App.firebaseProject) { [string]$App.firebaseProject } else { "" }
  $haystack = @($path, $id, $label, $leaf, $project) | Where-Object { $_ }

  foreach ($rule in $rules) {
    $r = [string]$rule
    if (-not $r) { continue }
    foreach ($h in $haystack) {
      if ($h -like "*$r*" -or $h -eq $r) { return $true }
      # so khop khong phan biet hoa thuong
      if ($h.ToLowerInvariant().Contains($r.ToLowerInvariant())) { return $true }
    }
  }
  return $false
}

function Add-DeployExclude {
  param(
    [object]$Config,
    [string]$Rule
  )
  $rule = [string]$Rule
  if (-not $rule) { return }
  $list = @()
  if ($Config.exclude) { $list = @($Config.exclude) }
  $exists = $list | Where-Object { [string]$_ -eq $rule } | Select-Object -First 1
  if (-not $exists) {
    $list += $rule
    $Config | Add-Member -NotePropertyName exclude -NotePropertyValue $list -Force
    [void](Save-DeployConfig $Config)
  }
}

function Get-MergedDeployApps {
  param([object]$Config)

  $byPath = @{}
  $order = [System.Collections.Generic.List[string]]::new()

  $register = {
    param($app)
    $p = Resolve-AppPath $app
    if (Test-AppExcluded -App ([pscustomobject]@{ path = $p; id = $app.id; label = $app.label; firebaseProject = $app.firebaseProject }) -Config $Config) {
      return
    }
    if (-not $byPath.ContainsKey($p)) {
      $app.path = $p
      $byPath[$p] = $app
      $order.Add($p)
    } else {
      # Config thu cong ghi de len discovery
      $existing = $byPath[$p]
      foreach ($prop in $app.PSObject.Properties) {
        if ($null -ne $prop.Value -and "$($prop.Value)" -ne "") {
          $existing | Add-Member -NotePropertyName $prop.Name -NotePropertyValue $prop.Value -Force
        }
      }
      $existing.path = $p
    }
  }

  # 1) App cau hinh thu cong
  if ($Config.apps) {
    foreach ($app in $Config.apps) {
      try { & $register ($app | ConvertTo-Json -Depth 6 | ConvertFrom-Json) } catch {}
    }
  }

  # 2) Quet Cursor
  $discover = $true
  if ($null -ne $Config.discoverCursor) { $discover = [bool]$Config.discoverCursor }
  if ($discover) {
    foreach ($folder in (Get-CursorRecentFolders)) {
      if (Test-IsFirebaseApp $folder) {
        try { & $register (New-AppFromPath -Path $folder -Config $Config -Source "cursor") } catch {}
      }
    }
  }

  # 3) Quet scanRoots + sibling
  foreach ($folder in (Get-ScanRootFolders $Config)) {
    if (Test-IsFirebaseApp $folder) {
      try { & $register (New-AppFromPath -Path $folder -Config $Config -Source "scan") } catch {}
    }
  }

  # Gan lai email tu accountByPath / accounts
  $list = @()
  foreach ($p in $order) {
    $app = $byPath[$p]
    if (Test-AppExcluded -App $app -Config $Config) { continue }
    if (-not $app.firebaseProject) {
      $app.firebaseProject = Get-FirebaseProjectId $p
    }
    if (-not $app.accountEmail -and $Config.accountByPath) {
      $mapped = $Config.accountByPath.PSObject.Properties | Where-Object { $_.Name -eq $p -or $_.Name -eq $app.path } | Select-Object -First 1
      if ($mapped) { $app | Add-Member -NotePropertyName accountEmail -NotePropertyValue ([string]$mapped.Value) -Force }
    }
    if (-not $app.accountEmail -and $app.accountId -and $Config.accounts) {
      $acc = $Config.accounts | Where-Object { $_.id -eq $app.accountId } | Select-Object -First 1
      if ($acc -and $acc.email) {
        $app | Add-Member -NotePropertyName accountEmail -NotePropertyValue ([string]$acc.email) -Force
      }
    }
    $list += $app
  }
  return $list
}

function Resolve-AppPath {
  param([object]$App)
  $root = Get-DeployRoot
  $p = [string]$App.path
  if (-not $p -or $p.Trim() -eq "") { return $root }
  if ([System.IO.Path]::IsPathRooted($p)) {
    if (-not (Test-Path -LiteralPath $p)) { throw "Duong dan app khong ton tai: $p" }
    return (Resolve-Path -LiteralPath $p).Path
  }
  $joined = Join-Path $root $p
  if (-not (Test-Path -LiteralPath $joined)) { throw "Khong tim thay thu muc app: $joined" }
  return (Resolve-Path -LiteralPath $joined).Path
}

function Get-DeployAccount {
  param([object]$Config, [object]$App)
  if ($App.accountEmail) {
    return [pscustomobject]@{
      id    = $(if ($App.accountId) { $App.accountId } else { "mapped" })
      label = $App.accountEmail
      email = $App.accountEmail
    }
  }
  if (-not $App.accountId) { return $null }
  return ($Config.accounts | Where-Object { $_.id -eq $App.accountId } | Select-Object -First 1)
}

function Select-FirebaseEmailInteractive {
  param(
    [object]$App,
    [object]$Config
  )
  $emails = @(Get-FirebaseLoggedInEmails)
  Write-Host ""
  Write-Host "Chua gan tai khoan Firebase cho: $($App.label)" -ForegroundColor Yellow
  Write-Host "Thu muc: $($App.path)" -ForegroundColor DarkGray

  if ($emails.Count -eq 0) {
    Write-Host "Chua co tai khoan. Chay: firebase login:add" -ForegroundColor Red
    throw "Chua dang nhap Firebase"
  }

  Write-Host ""
  Write-Host "Chon tai khoan Firebase cho app nay (se nho lai):" -ForegroundColor Cyan
  for ($i = 0; $i -lt $emails.Count; $i++) {
    Write-Host ("  {0,2}. {1}" -f ($i + 1), $emails[$i])
  }
  Write-Host "   A  Them tai khoan moi (firebase login:add)" -ForegroundColor DarkGray
  $pick = Read-Host "Chon so"

  if ($pick -match '^[Aa]$') {
    firebase login:add 2>&1 | Out-Host
    $emails = @(Get-FirebaseLoggedInEmails)
    if ($emails.Count -eq 0) { throw "Van chua co tai khoan Firebase" }
    return (Select-FirebaseEmailInteractive -App $App -Config $Config)
  }

  if ($pick -match '^\d+$') {
    $idx = [int]$pick - 1
    if ($idx -ge 0 -and $idx -lt $emails.Count) {
      return $emails[$idx]
    }
  }
  throw "Lua chon tai khoan khong hop le"
}

function Set-AppAccountMapping {
  param(
    [object]$Config,
    [object]$App,
    [string]$Email
  )
  $path = Resolve-AppPath $App
  if (-not $Config.accountByPath) {
    $Config | Add-Member -NotePropertyName accountByPath -NotePropertyValue ([pscustomobject]@{}) -Force
  }
  $Config.accountByPath | Add-Member -NotePropertyName $path -NotePropertyValue $Email -Force
  $App | Add-Member -NotePropertyName accountEmail -NotePropertyValue $Email -Force
  $App | Add-Member -NotePropertyName path -NotePropertyValue $path -Force

  # Dam bao co trong accounts[]
  $exists = $Config.accounts | Where-Object { $_.email -eq $Email } | Select-Object -First 1
  if (-not $exists) {
    $id = ($Email -split '@')[0] -replace '[^a-zA-Z0-9\-]', '-'
    $Config.accounts += [pscustomobject]@{ id = $id; label = $Email; email = $Email }
  }
  [void](Save-DeployConfig $Config)
}

function Resolve-AppFirebaseAccount {
  param(
    [object]$App,
    [object]$Config,
    [switch]$Interactive
  )
  $account = Get-DeployAccount $Config $App
  $email = if ($account -and $account.email) { [string]$account.email.Trim() } else { "" }

  if ($email -eq "" -and $Interactive) {
    $email = Select-FirebaseEmailInteractive -App $App -Config $Config
    Set-AppAccountMapping -Config $Config -App $App -Email $email
    $account = Get-DeployAccount $Config $App
  }

  if ($email -eq "") {
    $loggedIn = Get-FirebaseLoggedInEmails
    if ($loggedIn.Count -eq 1) {
      $email = $loggedIn[0]
      Write-Host "Dung tai khoan Firebase duy nhat: $email" -ForegroundColor Yellow
      Set-AppAccountMapping -Config $Config -App $App -Email $email
      $account = Get-DeployAccount $Config $App
    }
  }

  return $account
}

function Invoke-FirebaseAccount {
  param([object]$Account)
  if (-not $Account) { return }

  $email = if ($Account.email) { [string]$Account.email.Trim() } else { "" }
  if ($email -eq "") {
    throw "Chua co email Firebase — chon lai app de gan tai khoan"
  }

  Write-Host "Chuyen Firebase account -> $email" -ForegroundColor DarkCyan
  Invoke-NativeCommand -FailMessage "firebase login:use that bai — chay: firebase login:add" -Command {
    firebase login:use $email
  } | Out-Null
}

function Test-FirebaseProjectAccess {
  param([string]$ProjectId)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = firebase use $ProjectId 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) {
      Write-Host $out.TrimEnd()
      return $true
    }
    Write-Host $out.TrimEnd()
    return $false
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Invoke-FirebaseProject {
  param(
    [string]$ProjectId,
    [object]$Config = $null,
    [object]$App = $null,
    [switch]$Interactive
  )
  if (-not $ProjectId -or $ProjectId.Trim() -eq "") {
    throw "Chua biet Firebase project ID (.firebaserc thieu). Them firebaseProject vao config."
  }
  Write-Host "Firebase project: $ProjectId" -ForegroundColor DarkCyan

  if (Test-FirebaseProjectAccess $ProjectId) { return }

  # Thu cac tai khoan Firebase khac da login
  $emails = @(Get-FirebaseLoggedInEmails)
  $current = if ($App -and $App.accountEmail) { [string]$App.accountEmail } else { "" }
  foreach ($email in $emails) {
    if ($email -eq $current) { continue }
    Write-Host "Thu account khac: $email" -ForegroundColor Yellow
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { firebase login:use $email 2>&1 | Out-Host } finally { $ErrorActionPreference = $prev }
    if ($LASTEXITCODE -ne 0) { continue }
    if (Test-FirebaseProjectAccess $ProjectId) {
      if ($Config -and $App) {
        Set-AppAccountMapping -Config $Config -App $App -Email $email
        Write-Host "Da gan lai account $email cho $($App.label)" -ForegroundColor Green
      }
      return
    }
  }

  if ($Interactive) {
    Write-Host ""
    Write-Host "Khong account nao truy cap duoc project '$ProjectId'." -ForegroundColor Red
    Write-Host "Chay: firebase login:add  (dung Google co quyen project do)" -ForegroundColor Yellow
    $again = Read-Host "Da login:add xong? Nhan Enter de thu lai, hoac Q de bo qua"
    if ($again -notmatch '^[Qq]$') {
      Invoke-FirebaseProject -ProjectId $ProjectId -Config $Config -App $App
      return
    }
  }

  throw "firebase use that bai — sai tai khoan hoac khong co quyen project '$ProjectId'"
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
    $fetchCode = Invoke-NativeCommand -AllowFail -Command { git fetch origin $Branch }
    if ($fetchCode -ne 0) {
      Write-Host "git fetch that bai — van deploy code local hien co" -ForegroundColor Yellow
      return
    }
    $pullCode = Invoke-NativeCommand -AllowFail -Command { git pull origin $Branch }
    if ($pullCode -ne 0) {
      Write-Host "git pull that bai (co the do thay doi local) — van deploy code local" -ForegroundColor Yellow
      Write-Host "  Tip: git stash  hoac commit truoc khi deploy" -ForegroundColor DarkGray
    }
  } finally {
    Pop-Location
  }
}

function Get-AppVersionLabel {
  param([string]$RepoRoot)
  foreach ($rel in @("public\app-version.json", "public/app-version.json", "app-version.json")) {
    $verFile = Join-Path $RepoRoot $rel
    if (Test-Path $verFile) {
      try {
        $ver = Get-Content $verFile -Raw -Encoding UTF8 | ConvertFrom-Json
        $build = [int]$ver.build
        return "v1.$('{0:d3}' -f $build)"
      } catch { return $null }
    }
  }
  return $null
}

function Ensure-AppReady {
  param([string]$RepoRoot)
  if (-not (Test-Path (Join-Path $RepoRoot "package.json"))) {
    throw "Khong co package.json trong $RepoRoot"
  }

  $cfg = Join-Path $RepoRoot "public\firebase-config.js"
  $cfgAlt = Join-Path $RepoRoot "public/firebase-config.js"
  if (-not (Test-Path $cfg) -and -not (Test-Path $cfgAlt)) {
    $example = Join-Path $RepoRoot "public\firebase-config.example.js"
    if (Test-Path $example) {
      Write-Host ""
      Write-Host "THIEU public\firebase-config.js" -ForegroundColor Red
      Write-Host "  copy public\firebase-config.example.js public\firebase-config.js"
      throw "Thieu firebase-config.js"
    }
    Write-Host "Khong co public/firebase-config.js — tiep tuc (app co the khong can)." -ForegroundColor DarkYellow
  }

  if (-not (Test-Path (Join-Path $RepoRoot "node_modules"))) {
    Write-Host "Chua co node_modules — npm install..." -ForegroundColor Yellow
    Push-Location $RepoRoot
    try {
      Invoke-NativeCommand -FailMessage "npm install that bai" -Command { npm install } | Out-Null
    } finally {
      Pop-Location
    }
  }
}

function Invoke-NpmDeploy {
  param(
    [string]$RepoRoot,
    [string]$DeployKind,
    [switch]$FullDeploy
  )
  Push-Location $RepoRoot
  try {
    $pkg = Get-Content (Join-Path $RepoRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $scripts = @()
    if ($pkg.scripts) { $scripts = @($pkg.scripts.PSObject.Properties.Name) }

    if ($FullDeploy -or $DeployKind -eq "all") {
      if ($scripts -contains "deploy") {
        Write-Host "npm run deploy (full)..." -ForegroundColor Yellow
        Invoke-NativeCommand -FailMessage "npm run deploy that bai" -Command { npm run deploy } | Out-Null
      } else {
        Write-Host "npm run build + firebase deploy..." -ForegroundColor Yellow
        if ($scripts -contains "build") {
          Invoke-NativeCommand -FailMessage "build that bai" -Command { npm run build } | Out-Null
        }
        Invoke-NativeCommand -FailMessage "firebase deploy that bai" -Command { firebase deploy } | Out-Null
      }
    } else {
      if ($scripts -contains "deploy:hosting") {
        Write-Host "npm run deploy:hosting..." -ForegroundColor Yellow
        Invoke-NativeCommand -FailMessage "npm run deploy:hosting that bai" -Command { npm run deploy:hosting } | Out-Null
      } elseif ($scripts -contains "deploy") {
        Write-Host "npm run deploy..." -ForegroundColor Yellow
        Invoke-NativeCommand -FailMessage "npm run deploy that bai" -Command { npm run deploy } | Out-Null
      } else {
        Write-Host "npm run build + firebase deploy --only hosting..." -ForegroundColor Yellow
        if ($scripts -contains "build") {
          Invoke-NativeCommand -FailMessage "build that bai" -Command { npm run build } | Out-Null
        }
        Invoke-NativeCommand -FailMessage "firebase deploy that bai" -Command { firebase deploy --only hosting } | Out-Null
      }
    }
  } finally {
    Pop-Location
  }
}

function Invoke-AppDeploy {
  param(
    [object]$App,
    [object]$Config,
    [switch]$SkipPull,
    [switch]$FullDeploy,
    [switch]$Interactive
  )

  Test-DeployPrerequisites

  $repoRoot = Resolve-AppPath $App
  $App.path = $repoRoot
  $branch = if ($App.branch) { $App.branch } else { "main" }

  if (-not $App.firebaseProject) {
    $App.firebaseProject = Get-FirebaseProjectId $repoRoot
  }

  $account = Resolve-AppFirebaseAccount -App $App -Config $Config -Interactive:$Interactive

  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host " Deploy: $($App.label)" -ForegroundColor Cyan
  Write-Host " Thu muc: $repoRoot" -ForegroundColor Cyan
  if ($App.firebaseProject) { Write-Host " Project: $($App.firebaseProject)" -ForegroundColor Cyan }
  if ($account -and $account.email) { Write-Host " Account: $($account.email)" -ForegroundColor Cyan }
  Write-Host "========================================" -ForegroundColor Cyan

  Sync-GitBranch -RepoRoot $repoRoot -Branch $branch -SkipPull:$SkipPull

  $verBefore = Get-AppVersionLabel $repoRoot
  if ($verBefore) {
    Write-Host "Version tren Git (truoc build): $verBefore" -ForegroundColor Green
  }

  Ensure-AppReady $repoRoot

  Invoke-FirebaseAccount $account
  Invoke-FirebaseProject -ProjectId $App.firebaseProject -Config $Config -App $App -Interactive:$Interactive
  Invoke-NpmDeploy -RepoRoot $repoRoot -DeployKind ([string]$App.deploy) -FullDeploy:$FullDeploy

  $verAfter = Get-AppVersionLabel $repoRoot
  $url = if ($App.siteUrl) { $App.siteUrl } elseif ($App.firebaseProject) { "https://$($App.firebaseProject).web.app" } else { "" }
  Write-Host ""
  Write-Host "XONG — $($App.label)" -ForegroundColor Green
  if ($verAfter) { Write-Host "  Version: $verAfter" -ForegroundColor Green }
  if ($url) { Write-Host "  Site: $url" -ForegroundColor Green }
}
