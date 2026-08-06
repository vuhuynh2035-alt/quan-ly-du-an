# Deploy Firebase — thu vien dung chung (ban rebuild)
# Quet app tu Cursor, doi tai khoan Firebase, git pull, build, hosting

function Test-CommandExists {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-External {
  param(
    [scriptblock]$Command,
    [string]$FailMessage = "Lenh that bai",
    [switch]$AllowFail
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $code = 0
  try {
    & $Command 2>&1 | ForEach-Object {
      if ($_ -is [System.Management.Automation.ErrorRecord]) {
        Write-Host $_.ToString()
      } else {
        Write-Host "$_"
      }
    }
    if ($null -ne $LASTEXITCODE) { $code = [int]$LASTEXITCODE }
  } finally {
    $ErrorActionPreference = $prev
  }
  if (-not $AllowFail -and $code -ne 0) {
    throw "$FailMessage (exit $code)"
  }
  return $code
}

function Get-DeployRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Get-DeployConfigPath {
  $local = Join-Path $PSScriptRoot "deploy-apps.local.json"
  if (Test-Path -LiteralPath $local) { return $local }
  return (Join-Path $PSScriptRoot "deploy-apps.config.json")
}

function Save-DeployConfig {
  param([object]$Config)
  # Dam bao apps chi chua object, exclude chi chua string
  $Config = Repair-DeployConfigObject $Config
  $path = Join-Path $PSScriptRoot "deploy-apps.local.json"
  $json = $Config | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
  Write-Host "Da luu: $path" -ForegroundColor DarkGray
}

function Repair-DeployConfigObject {
  param([object]$Config)

  $keepNames = @("xuanquynh", "xuan-quynh", "xuan_quynh", "apartment", "hotel_app_firebase", "hotel-xuan-quynh")

  $goodApps = @()
  $extraExclude = @()

  foreach ($item in @($Config.apps)) {
    if ($null -eq $item) { continue }
    # String bi nhét nhầm vào apps (file hỏng) → chuyển sang exclude (trừ Xuan Quynh)
    if ($item -is [string]) {
      $s = [string]$item
      if (-not $s) { continue }
      $low = $s.ToLowerInvariant()
      if ($low -eq "hotel") { continue }
      $keep = $false
      foreach ($k in $keepNames) { if ($low.Contains($k)) { $keep = $true; break } }
      if (-not $keep) { $extraExclude += $s }
      continue
    }
    # Chi giu object co id hoac path/label
    if ($item -is [System.Management.Automation.PSObject] -or $item -is [hashtable]) {
      $id = $null
      try { $id = $item.id } catch {}
      $path = $null
      try { $path = $item.path } catch {}
      $label = $null
      try { $label = $item.label } catch {}
      if ($id -or $label -or ($null -ne $path)) {
        $goodApps += $item
      }
    }
  }

  $ex = @()
  foreach ($r in @($Config.exclude)) {
    if ($null -eq $r) { continue }
    $s = [string]$r
    if (-not $s) { continue }
    $low = $s.ToLowerInvariant()
    if ($low -eq "hotel") { continue }
    $keep = $false
    foreach ($k in $keepNames) { if ($low.Contains($k)) { $keep = $true; break } }
    if ($keep) { continue }
    $ex += $s
  }
  foreach ($s in $extraExclude) {
    if (-not ($ex | Where-Object { "$_" -eq $s })) { $ex += $s }
  }

  $Config | Add-Member apps $goodApps -Force
  $Config | Add-Member exclude $ex -Force

  # Neu mat app quan-ly-du-an, them lai mac dinh
  $hasQld = $goodApps | Where-Object { $_.id -eq "quan-ly-du-an" -or $_.firebaseProject -eq "quan-ly-du-an-7d651" } | Select-Object -First 1
  if (-not $hasQld) {
    $defaultApp = [pscustomobject]@{
      id              = "quan-ly-du-an"
      label           = "Quan ly du an"
      path            = ""
      branch          = "main"
      firebaseProject = "quan-ly-du-an-7d651"
      deploy          = "hosting"
      siteUrl         = "https://quan-ly-du-an-7d651.web.app"
    }
    $Config | Add-Member apps (@($defaultApp) + @($goodApps)) -Force
  }

  return $Config
}

function Read-DeployConfig {
  $path = Get-DeployConfigPath
  if (-not (Test-Path -LiteralPath $path)) {
    $example = Join-Path $PSScriptRoot "deploy-apps.config.example.json"
    if (Test-Path -LiteralPath $example) {
      Copy-Item $example $path
      Write-Host "Da tao config tu file mau: $path" -ForegroundColor Green
    } else {
      throw "Khong tim thay config deploy."
    }
  }

  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  try {
    $cfg = $raw | ConvertFrom-Json
  } catch {
    Write-Host "File config bi hong JSON. Tao lai file sach..." -ForegroundColor Yellow
    $backup = "$path.broken-$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
    Copy-Item -LiteralPath $path $backup -Force
    Write-Host "Da backup: $backup" -ForegroundColor DarkGray
    $cfg = [pscustomobject]@{
      discoverCursor = $true
      scanRoots      = @()
      exclude        = @()
      accounts       = @()
      accountByPath  = ([pscustomobject]@{})
      apps           = @(
        [pscustomobject]@{
          id              = "quan-ly-du-an"
          label           = "Quan ly du an"
          path            = ""
          branch          = "main"
          firebaseProject = "quan-ly-du-an-7d651"
          deploy          = "hosting"
          siteUrl         = "https://quan-ly-du-an-7d651.web.app"
        }
      )
    }
    $path = Join-Path $PSScriptRoot "deploy-apps.local.json"
    $json = $cfg | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
  }

  if (-not $cfg.PSObject.Properties["accounts"]) { $cfg | Add-Member accounts @() -Force }
  if (-not $cfg.PSObject.Properties["apps"]) { $cfg | Add-Member apps @() -Force }
  if (-not $cfg.PSObject.Properties["accountByPath"]) { $cfg | Add-Member accountByPath ([pscustomobject]@{}) -Force }
  if (-not $cfg.PSObject.Properties["exclude"]) { $cfg | Add-Member exclude @() -Force }
  if (-not $cfg.PSObject.Properties["scanRoots"]) { $cfg | Add-Member scanRoots @() -Force }
  if (-not $cfg.PSObject.Properties["discoverCursor"]) { $cfg | Add-Member discoverCursor $true -Force }

  $before = ($cfg.apps | ConvertTo-Json -Compress -Depth 5)
  $cfg = Repair-DeployConfigObject $cfg
  $after = ($cfg.apps | ConvertTo-Json -Compress -Depth 5)

  # Neu sua duoc file hong (string trong apps), ghi lai local
  if ($before -ne $after -or ($raw -match '"apps"\s*:\s*\[[^\]]*"hotel"')) {
    $localPath = Join-Path $PSScriptRoot "deploy-apps.local.json"
    $json = $cfg | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($localPath, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
    Write-Host "Da sua config bi hong -> $localPath" -ForegroundColor Green
  }

  return $cfg
}

function Get-FirebaseEmails {
  if (-not (Test-CommandExists "firebase")) { return @() }
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $lines = @(firebase login:list 2>&1)
    if ($LASTEXITCODE -ne 0) { return @() }
    $emails = @()
    foreach ($line in $lines) {
      if ("$line" -match '([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})') {
        $emails += $Matches[1]
      }
    }
    return @($emails | Select-Object -Unique)
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Show-FirebaseAccounts {
  Write-Host ""
  Write-Host "Tai khoan Firebase tren may:" -ForegroundColor Cyan
  $emails = @(Get-FirebaseEmails)
  if ($emails.Count -eq 0) {
    Write-Host "  (chua co)" -ForegroundColor Yellow
  } else {
    foreach ($e in $emails) { Write-Host "  - $e" }
  }
  Write-Host ""
}

function ConvertFrom-FileUri {
  param([string]$Uri)
  if (-not $Uri) { return $null }
  $u = $Uri.Trim()
  if ($u -match '^file:') {
    try {
      $decoded = [System.Uri]::UnescapeDataString(($u -replace '^file:///', '' -replace '^file://', ''))
      if ($decoded -match '^[A-Za-z]:') { return ($decoded -replace '/', '\') }
      if ($decoded.StartsWith('/')) { return $decoded }
      return ($decoded -replace '/', '\')
    } catch { return $null }
  }
  return $u
}

function Get-CursorFolderInfos {
  # Tra ve @{ Path; LastUsed } — LastUsed = thoi gian workspace Cursor moi nhat
  $map = @{}

  $touch = {
    param($folderPath, $when)
    if (-not $folderPath) { return }
    $p = [string]$folderPath
    if ($p -match '^file:') { $p = ConvertFrom-FileUri $p }
    if (-not $p) { return }
    try {
      if (-not (Test-Path -LiteralPath $p -PathType Container)) { return }
      $r = (Resolve-Path -LiteralPath $p).Path
      $t = if ($when) { [datetime]$when } else { [datetime]::MinValue }
      if (-not $map.ContainsKey($r) -or $t -gt $map[$r]) {
        $map[$r] = $t
      }
    } catch {}
  }

  $userRoots = @()
  if ($env:APPDATA) {
    $userRoots += (Join-Path $env:APPDATA "Cursor\User")
    $userRoots += (Join-Path $env:APPDATA "Cursor - Insiders\User")
  }
  if ($env:HOME) {
    $userRoots += (Join-Path $env:HOME ".config/Cursor/User")
    $userRoots += (Join-Path $env:HOME "Library/Application Support/Cursor/User")
  }

  foreach ($userRoot in ($userRoots | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $userRoot)) { continue }

    $ws = Join-Path $userRoot "workspaceStorage"
    if (Test-Path -LiteralPath $ws) {
      Get-ChildItem -LiteralPath $ws -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $wj = Join-Path $_.FullName "workspace.json"
        if (Test-Path -LiteralPath $wj) {
          try {
            $data = Get-Content -LiteralPath $wj -Raw -Encoding UTF8 | ConvertFrom-Json
            $when = $_.LastWriteTime
            if (Test-Path -LiteralPath (Join-Path $_.FullName "state.vscdb")) {
              $db = Get-Item -LiteralPath (Join-Path $_.FullName "state.vscdb") -ErrorAction SilentlyContinue
              if ($db -and $db.LastWriteTime -gt $when) { $when = $db.LastWriteTime }
            }
            if ($data.folder) { & $touch $data.folder $when }
          } catch {}
        }
      }
    }

    $storage = Join-Path $userRoot "globalStorage\storage.json"
    if (-not (Test-Path -LiteralPath $storage)) {
      $storage = Join-Path $userRoot "globalStorage/storage.json"
    }
    if (Test-Path -LiteralPath $storage) {
      try {
        $raw = Get-Content -LiteralPath $storage -Raw -Encoding UTF8
        $when = (Get-Item -LiteralPath $storage).LastWriteTime
        [regex]::Matches($raw, 'file:///[^\s"\\]+') | ForEach-Object { & $touch $_.Value $when }
      } catch {}
    }
  }

  $list = @()
  foreach ($k in $map.Keys) {
    $list += [pscustomobject]@{ Path = $k; LastUsed = $map[$k] }
  }
  return $list
}

function Get-CursorFolders {
  return @((Get-CursorFolderInfos).Path)
}

function Get-PathRecency {
  param([string]$Path, [hashtable]$CursorTimes)
  if ($CursorTimes -and $CursorTimes.ContainsKey($Path)) { return [datetime]$CursorTimes[$Path] }
  try {
    if (Test-Path -LiteralPath $Path) {
      return (Get-Item -LiteralPath $Path).LastWriteTime
    }
  } catch {}
  return [datetime]::MinValue
}

function Get-AppRank {
  # Diem cao = uu tien giu lai khi trung Firebase project
  param([object]$App, [hashtable]$CursorTimes)
  $score = 0L
  $recency = Get-PathRecency -Path $App.path -CursorTimes $CursorTimes
  $score += [int64]($recency.Ticks / 10000000)  # seconds

  $p = ([string]$App.path).ToLowerInvariant()
  $src = if ($App.source) { [string]$App.source } else { "" }

  if ($src -eq "cursor") { $score += 100000000 }
  if ($p -match 'github') { $score += 50000000 }
  if ($p -match 'xuanquynh') { $score += 40000000 }
  if ($p -match 'onedrive') { $score += 10000000 }
  # Ban copy cu o C:\hotel_app_firebase — diem thap hon
  if ($p -match '^[a-z]:\\hotel_app_firebase') { $score -= 30000000 }

  return $score
}

function Get-FirebaseProjectId {
  param([string]$RepoRoot)
  $rc = Join-Path $RepoRoot ".firebaserc"
  if (-not (Test-Path -LiteralPath $rc)) { return "" }
  try {
    $data = Get-Content -LiteralPath $rc -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($data.projects.default) { return [string]$data.projects.default }
    $props = @($data.projects.PSObject.Properties)
    if ($props.Count -gt 0) { return [string]$props[0].Value }
  } catch {}
  return ""
}

function Test-IsFirebaseApp {
  param([string]$RepoRoot)
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "package.json"))) { return $false }
  if (Test-Path -LiteralPath (Join-Path $RepoRoot "firebase.json")) { return $true }
  if (Test-Path -LiteralPath (Join-Path $RepoRoot ".firebaserc")) { return $true }
  return $false
}

function Test-IsExcluded {
  param([object]$App, [object]$Config)
  $rules = @()
  if ($Config.exclude) { $rules = @($Config.exclude | Where-Object { $_ }) }
  if ($rules.Count -eq 0) { return $false }

  $path = [string]$App.path
  $leaf = if ($path) { Split-Path $path -Leaf } else { "" }
  $checks = @($path, [string]$App.id, [string]$App.label, $leaf, [string]$App.firebaseProject) | Where-Object { $_ }

  foreach ($rule in $rules) {
    $r = ([string]$rule).ToLowerInvariant()
    # Khong dung rule "hotel" chung — an nham Xuan Quynh
    if ($r -eq "hotel") { continue }
    foreach ($h in $checks) {
      if ($h.ToLowerInvariant().Contains($r)) { return $true }
    }
  }
  return $false
}

function Get-AccountEmailForPath {
  param([object]$Config, [string]$Path)
  if (-not $Config.accountByPath) { return "" }
  foreach ($prop in $Config.accountByPath.PSObject.Properties) {
    try {
      if ($prop.Name -eq $Path) { return [string]$prop.Value }
      if ((Test-Path -LiteralPath $prop.Name) -and ((Resolve-Path -LiteralPath $prop.Name).Path -eq $Path)) {
        return [string]$prop.Value
      }
    } catch {}
  }
  return ""
}

function New-DiscoveredApp {
  param([string]$Path, [object]$Config, [string]$Source)
  $name = Split-Path $Path -Leaf
  $id = ($name -replace '[^a-zA-Z0-9\-]+', '-').ToLowerInvariant()
  if (-not $id) { $id = "app" }
  $project = Get-FirebaseProjectId $Path
  $email = Get-AccountEmailForPath $Config $Path

  return [pscustomobject]@{
    id              = $id
    label           = $name
    path            = $Path
    branch          = "main"
    firebaseProject = $project
    accountEmail    = $email
    deploy          = "hosting"
    siteUrl         = $(if ($project) { "https://$project.web.app" } else { "" })
    source          = $Source
  }
}

function Resolve-AppPath {
  param([object]$App)
  $root = Get-DeployRoot
  $p = [string]$App.path
  if (-not $p -or $p.Trim() -eq "") { return $root }
  if ([System.IO.Path]::IsPathRooted($p)) {
    if (-not (Test-Path -LiteralPath $p)) { throw "Duong dan khong ton tai: $p" }
    return (Resolve-Path -LiteralPath $p).Path
  }
  $joined = Join-Path $root $p
  if (-not (Test-Path -LiteralPath $joined)) { throw "Khong tim thay: $joined" }
  return (Resolve-Path -LiteralPath $joined).Path
}

function Get-DeployApps {
  param([object]$Config)

  $cursorInfos = @(Get-CursorFolderInfos)
  $cursorTimes = @{}
  foreach ($info in $cursorInfos) {
    $cursorTimes[$info.Path] = $info.LastUsed
  }

  $byPath = @{}
  $order = New-Object System.Collections.Generic.List[string]

  $register = {
    param($app)
    try {
      $p = Resolve-AppPath $app
      try { $p = [System.IO.Path]::GetFullPath($p) } catch {}
      $app.path = $p
      if (-not $app.firebaseProject) {
        $app | Add-Member firebaseProject (Get-FirebaseProjectId $p) -Force
      }
      if (-not $app.accountEmail) {
        $em = Get-AccountEmailForPath $Config $p
        $app | Add-Member accountEmail $em -Force
      }
      $recency = Get-PathRecency -Path $p -CursorTimes $cursorTimes
      $app | Add-Member lastUsed $recency -Force
      $app | Add-Member rank (Get-AppRank -App $app -CursorTimes $cursorTimes) -Force

      if (Test-IsExcluded -App $app -Config $Config) { return }

      $key = $p.ToLowerInvariant()
      if (-not $byPath.ContainsKey($key)) {
        $byPath[$key] = $app
        [void]$order.Add($key)
      } else {
        $ex = $byPath[$key]
        foreach ($prop in $app.PSObject.Properties) {
          if ($null -ne $prop.Value -and "$($prop.Value)" -ne "") {
            $ex | Add-Member -NotePropertyName $prop.Name -NotePropertyValue $prop.Value -Force
          }
        }
        if ([int64]$app.rank -gt [int64]$ex.rank) {
          $ex | Add-Member rank $app.rank -Force
          $ex | Add-Member lastUsed $app.lastUsed -Force
          if ($app.source) { $ex | Add-Member source $app.source -Force }
        }
      }
    } catch {}
  }

  if ($Config.apps) {
    foreach ($a in @($Config.apps)) {
      $copy = $a | ConvertTo-Json -Depth 6 | ConvertFrom-Json
      if (-not $copy.PSObject.Properties["source"]) { $copy | Add-Member source "config" -Force }
      & $register $copy
    }
  }

  $discover = $true
  if ($null -ne $Config.discoverCursor) { $discover = [bool]$Config.discoverCursor }
  if ($discover) {
    foreach ($info in $cursorInfos) {
      if (Test-IsFirebaseApp $info.Path) {
        & $register (New-DiscoveredApp -Path $info.Path -Config $Config -Source "cursor")
      }
    }
  }

  $scan = New-Object System.Collections.Generic.List[string]
  if ($Config.scanRoots) {
    foreach ($root in @($Config.scanRoots)) {
      if (-not $root) { continue }
      if (Test-Path -LiteralPath $root) {
        [void]$scan.Add((Resolve-Path -LiteralPath $root).Path)
        Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
          [void]$scan.Add($_.FullName)
        }
      }
    }
  }
  $parent = Split-Path (Get-DeployRoot) -Parent
  if ($parent -and (Test-Path -LiteralPath $parent)) {
    Get-ChildItem -LiteralPath $parent -Directory -ErrorAction SilentlyContinue | ForEach-Object {
      [void]$scan.Add($_.FullName)
    }
  }
  foreach ($folder in ($scan | Select-Object -Unique)) {
    if (Test-IsFirebaseApp $folder) {
      & $register (New-DiscoveredApp -Path $folder -Config $Config -Source "scan")
    }
  }

  $list = @()
  foreach ($k in $order) { $list += $byPath[$k] }

  # Gop trung Firebase project — giu ban diem cao (Cursor moi / GitHub / XuanQuynh)
  $byProject = @{}
  $noProject = @()
  foreach ($app in $list) {
    $proj = [string]$app.firebaseProject
    if (-not $proj) { $noProject += $app; continue }
    if (-not $byProject.ContainsKey($proj)) {
      $byProject[$proj] = $app
    } else {
      $cur = $byProject[$proj]
      if ([int64]$app.rank -gt [int64]$cur.rank) {
        try { Add-ExcludeRule -Config $Config -Rule ([string]$cur.path) } catch {}
        $byProject[$proj] = $app
      } else {
        try { Add-ExcludeRule -Config $Config -Rule ([string]$app.path) } catch {}
      }
    }
  }

  $final = @($byProject.Values) + $noProject
  return @($final | Sort-Object @{ Expression = { [int64]$_.rank }; Descending = $true })
}

function Set-AccountMapping {
  param([object]$Config, [object]$App, [string]$Email)
  $path = Resolve-AppPath $App
  if (-not $Config.accountByPath) {
    $Config | Add-Member accountByPath ([pscustomobject]@{}) -Force
  }
  $Config.accountByPath | Add-Member -NotePropertyName $path -NotePropertyValue $Email -Force
  $App | Add-Member accountEmail $Email -Force
  $App | Add-Member path $path -Force

  $exists = @($Config.accounts | Where-Object { $_.email -eq $Email })
  if ($exists.Count -eq 0) {
    $id = (($Email -split '@')[0] -replace '[^a-zA-Z0-9\-]', '-')
    $Config.accounts = @($Config.accounts) + @([pscustomobject]@{ id = $id; label = $Email; email = $Email })
  }
  Save-DeployConfig $Config
}

function Add-ExcludeRule {
  param([object]$Config, [string]$Rule)
  if (-not $Rule) { return }
  $list = @()
  if ($Config.exclude) { $list = @($Config.exclude) }
  if (-not ($list | Where-Object { "$_" -eq $Rule })) {
    $list += $Rule
    $Config | Add-Member exclude $list -Force
    Save-DeployConfig $Config
  }
}

function Select-AccountInteractive {
  param([object]$App, [object]$Config)
  $emails = @(Get-FirebaseEmails)
  Write-Host ""
  Write-Host "Chon tai khoan Firebase cho: $($App.label)" -ForegroundColor Yellow
  Write-Host "  $($App.path)" -ForegroundColor DarkGray
  if ($emails.Count -eq 0) {
    throw "Chua co tai khoan. Bam M > T de firebase login:add"
  }
  for ($i = 0; $i -lt $emails.Count; $i++) {
    Write-Host ("  {0,2}. {1}" -f ($i + 1), $emails[$i])
  }
  Write-Host "   T  Them tai khoan moi" -ForegroundColor DarkGray
  $pick = Read-Host "Chon so"
  if ($pick -match '^[Tt]$') {
    Invoke-External -AllowFail -Command { firebase login:add } | Out-Null
    return (Select-AccountInteractive -App $App -Config $Config)
  }
  if ($pick -match '^\d+$') {
    $idx = [int]$pick - 1
    if ($idx -ge 0 -and $idx -lt $emails.Count) { return $emails[$idx] }
  }
  throw "Lua chon tai khoan khong hop le"
}

function Resolve-AppAccount {
  param([object]$App, [object]$Config, [switch]$Interactive)
  $email = if ($App.accountEmail) { [string]$App.accountEmail.Trim() } else { "" }

  if ($email -eq "" -and $App.accountId -and $Config.accounts) {
    $acc = @($Config.accounts | Where-Object { $_.id -eq $App.accountId } | Select-Object -First 1)
    if ($acc.Count -gt 0 -and $acc[0].email) { $email = [string]$acc[0].email }
  }

  if ($email -eq "" -and $Interactive) {
    $email = Select-AccountInteractive -App $App -Config $Config
    Set-AccountMapping -Config $Config -App $App -Email $email
  }

  if ($email -eq "") {
    $emails = @(Get-FirebaseEmails)
    if ($emails.Count -eq 1) {
      $email = $emails[0]
      Set-AccountMapping -Config $Config -App $App -Email $email
    }
  }

  if ($email -eq "") { return $null }
  return [pscustomobject]@{ email = $email; label = $email }
}

function Invoke-FirebaseLoginUse {
  param([string]$Email)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = firebase login:use $Email 2>&1 | Out-String
    $code = $LASTEXITCODE
    $text = $out.TrimEnd()
    if ($text) { Write-Host $text }
    if ($code -eq 0) { return $true }
    if ($text -match '(?i)Already using account') { return $true }
    return $false
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Test-FirebaseProjectAccess {
  param([string]$ProjectId)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = firebase use $ProjectId 2>&1 | Out-String
    $text = $out.TrimEnd()
    if ($text) { Write-Host $text }
    if ($LASTEXITCODE -ne 0) { return $false }

    # firebase use co the "thanh cong" tren .firebaserc local du account khong co quyen API
    $listOut = firebase projects:list --json 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) {
      # fallback: thu get project
      $getOut = firebase projects:get $ProjectId 2>&1 | Out-String
      if ($getOut -match '(?i)Failed to get Firebase project|permission|not have') {
        Write-Host "Account hien tai khong co quyen project '$ProjectId'" -ForegroundColor Yellow
        return $false
      }
      return ($LASTEXITCODE -eq 0)
    }
    if ($listOut -match [regex]::Escape($ProjectId)) { return $true }
    Write-Host "Project '$ProjectId' khong co trong danh sach account hien tai." -ForegroundColor Yellow
    return $false
  } finally {
    $ErrorActionPreference = $prev
  }
}

function Use-FirebaseProject {
  param(
    [string]$ProjectId,
    [object]$Config,
    [object]$App,
    [switch]$Interactive
  )
  if (-not $ProjectId) {
    throw "Chua co Firebase project ID (.firebaserc). Mo project dung hoac sua config."
  }
  Write-Host "Firebase project: $ProjectId" -ForegroundColor DarkCyan
  if (Test-FirebaseProjectAccess $ProjectId) { return }

  $current = if ($App.accountEmail) { [string]$App.accountEmail } else { "" }
  foreach ($email in @(Get-FirebaseEmails)) {
    if ($email -eq $current) { continue }
    Write-Host "Thu account: $email" -ForegroundColor Yellow
    if (-not (Invoke-FirebaseLoginUse $email)) { continue }
    if (Test-FirebaseProjectAccess $ProjectId) {
      Set-AccountMapping -Config $Config -App $App -Email $email
      Write-Host "Da gan account $email cho $($App.label)" -ForegroundColor Green
      return
    }
  }

  if ($Interactive) {
    Write-Host "Khong account nao co quyen project '$ProjectId'." -ForegroundColor Red
    Write-Host "Bam M > T de them tai khoan Google dung." -ForegroundColor Yellow
    $again = Read-Host "Da login xong? Enter = thu lai, Q = bo"
    if ($again -notmatch '^[Qq]$') {
      Use-FirebaseProject -ProjectId $ProjectId -Config $Config -App $App
      return
    }
  }
  throw "Khong truy cap duoc Firebase project '$ProjectId'"
}

function Sync-Git {
  param([string]$RepoRoot, [string]$Branch, [switch]$SkipPull)
  if ($SkipPull) {
    Write-Host "Bo qua git pull" -ForegroundColor DarkYellow
    return
  }
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    Write-Host "Khong phai git repo — bo qua pull" -ForegroundColor DarkYellow
    return
  }
  Push-Location $RepoRoot
  try {
    Write-Host "Git pull origin $Branch..." -ForegroundColor Yellow
    $fc = Invoke-External -AllowFail -Command { git fetch origin $Branch }
    if ($fc -ne 0) {
      Write-Host "git fetch loi — deploy code local" -ForegroundColor Yellow
      return
    }
    $pc = Invoke-External -AllowFail -Command { git pull origin $Branch }
    if ($pc -ne 0) {
      Write-Host "git pull loi — deploy code local (stash/commit neu can)" -ForegroundColor Yellow
    }
  } finally {
    Pop-Location
  }
}

function Get-VersionLabel {
  param([string]$RepoRoot)
  foreach ($rel in @("public\app-version.json", "public/app-version.json")) {
    $f = Join-Path $RepoRoot $rel
    if (Test-Path -LiteralPath $f) {
      try {
        $v = Get-Content -LiteralPath $f -Raw -Encoding UTF8 | ConvertFrom-Json
        return ("v1.{0:d3}" -f [int]$v.build)
      } catch { return $null }
    }
  }
  return $null
}

function Ensure-Ready {
  param([string]$RepoRoot)
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "package.json"))) {
    throw "Khong co package.json: $RepoRoot"
  }
  $cfg = Join-Path $RepoRoot "public\firebase-config.js"
  $ex = Join-Path $RepoRoot "public\firebase-config.example.js"
  if (-not (Test-Path -LiteralPath $cfg) -and (Test-Path -LiteralPath $ex)) {
    throw "Thieu public\firebase-config.js — copy tu firebase-config.example.js"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "node_modules"))) {
    Write-Host "npm install..." -ForegroundColor Yellow
    Push-Location $RepoRoot
    try {
      Invoke-External -FailMessage "npm install that bai" -Command { npm install } | Out-Null
    } finally {
      Pop-Location
    }
  }
}

function Invoke-DeployCommands {
  param(
    [string]$RepoRoot,
    [string]$Kind,
    [switch]$FullDeploy,
    [switch]$AllowFail
  )
  Push-Location $RepoRoot
  try {
    $pkg = Get-Content -LiteralPath (Join-Path $RepoRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $scripts = @()
    if ($pkg.scripts) { $scripts = @($pkg.scripts.PSObject.Properties.Name) }

    $wantFull = $FullDeploy -or ($Kind -eq "all")
    $code = 0
    if ($wantFull) {
      if ($scripts -contains "deploy") {
        Write-Host "npm run deploy..." -ForegroundColor Yellow
        $code = Invoke-External -AllowFail -Command { npm run deploy }
      } else {
        if ($scripts -contains "build") {
          Invoke-External -FailMessage "build that bai" -Command { npm run build } | Out-Null
        }
        $code = Invoke-External -AllowFail -Command { firebase deploy }
      }
    } else {
      if ($scripts -contains "deploy:hosting") {
        Write-Host "npm run deploy:hosting..." -ForegroundColor Yellow
        $code = Invoke-External -AllowFail -Command { npm run deploy:hosting }
      } elseif ($scripts -contains "deploy") {
        Write-Host "npm run deploy..." -ForegroundColor Yellow
        $code = Invoke-External -AllowFail -Command { npm run deploy }
      } else {
        if ($scripts -contains "build") {
          Invoke-External -FailMessage "build that bai" -Command { npm run build } | Out-Null
        }
        $code = Invoke-External -AllowFail -Command { firebase deploy --only hosting }
      }
    }
    if (-not $AllowFail -and $code -ne 0) {
      throw "firebase deploy that bai (exit $code)"
    }
    return $code
  } finally {
    Pop-Location
  }
}

function Clear-AccountMapping {
  param([object]$Config, [string]$Path)
  if (-not $Config.accountByPath -or -not $Path) { return }
  $obj = [pscustomobject]@{}
  foreach ($prop in $Config.accountByPath.PSObject.Properties) {
    if ($prop.Name -ne $Path) {
      $obj | Add-Member -NotePropertyName $prop.Name -NotePropertyValue $prop.Value -Force
    }
  }
  $Config | Add-Member accountByPath $obj -Force
  $Config.apps = @($Config.apps)
  Save-DeployConfig $Config
}

function Invoke-AppDeploy {
  param(
    [object]$App,
    [object]$Config,
    [switch]$SkipPull,
    [switch]$FullDeploy,
    [switch]$Interactive
  )

  foreach ($cmd in @("git", "node", "npm", "firebase")) {
    if (-not (Test-CommandExists $cmd)) {
      throw "Thieu '$cmd' tren PATH. Cai Node.js + npm i -g firebase-tools"
    }
  }

  $root = Resolve-AppPath $App
  $App.path = $root
  $branch = if ($App.branch) { [string]$App.branch } else { "main" }
  if (-not $App.firebaseProject) {
    $App | Add-Member firebaseProject (Get-FirebaseProjectId $root) -Force
  }

  $account = Resolve-AppAccount -App $App -Config $Config -Interactive:$Interactive

  Write-Host ""
  Write-Host "========================================" -ForegroundColor Cyan
  Write-Host " Deploy: $($App.label)" -ForegroundColor Cyan
  Write-Host " Thu muc: $root" -ForegroundColor Cyan
  if ($App.firebaseProject) { Write-Host " Project: $($App.firebaseProject)" -ForegroundColor Cyan }
  if ($account) { Write-Host " Account: $($account.email)" -ForegroundColor Cyan }
  Write-Host "========================================" -ForegroundColor Cyan

  Sync-Git -RepoRoot $root -Branch $branch -SkipPull:$SkipPull

  $ver = Get-VersionLabel $root
  if ($ver) { Write-Host "Version (truoc build): $ver" -ForegroundColor Green }

  Ensure-Ready $root

  if ($account) {
    Write-Host "Chuyen Firebase account -> $($account.email)" -ForegroundColor DarkCyan
    if (-not (Invoke-FirebaseLoginUse $account.email)) {
      throw "firebase login:use that bai — bam M > T de login:add"
    }
  }

  Use-FirebaseProject -ProjectId $App.firebaseProject -Config $Config -App $App -Interactive:$Interactive

  $code = Invoke-DeployCommands -RepoRoot $root -Kind ([string]$App.deploy) -FullDeploy:$FullDeploy -AllowFail
  if ($code -ne 0) {
    Write-Host ""
    Write-Host "Deploy that bai — thu tai khoan Firebase khac..." -ForegroundColor Yellow
    Clear-AccountMapping -Config $Config -Path $root
    $App | Add-Member accountEmail "" -Force

    $tried = @()
    if ($account) { $tried += $account.email }
    $ok = $false
    foreach ($email in @(Get-FirebaseEmails)) {
      if ($tried -contains $email) { continue }
      Write-Host "Thu deploy bang: $email" -ForegroundColor Yellow
      if (-not (Invoke-FirebaseLoginUse $email)) { continue }
      if (-not (Test-FirebaseProjectAccess $App.firebaseProject)) { continue }
      $code2 = Invoke-DeployCommands -RepoRoot $root -Kind ([string]$App.deploy) -FullDeploy:$FullDeploy -AllowFail
      if ($code2 -eq 0) {
        Set-AccountMapping -Config $Config -App $App -Email $email
        $ok = $true
        break
      }
    }

    if (-not $ok -and $Interactive) {
      Write-Host ""
      Write-Host "Account hien tai KHONG co quyen project '$($App.firebaseProject)'." -ForegroundColor Red
      Write-Host "Can login Google dung (Firebase Console -> Project settings -> Users)." -ForegroundColor Yellow
      Write-Host "Bam M > T de them TK, roi chon lai app." -ForegroundColor Yellow
      $go = Read-Host "Da login:add xong? Enter = chon TK moi, Q = dung"
      if ($go -notmatch '^[Qq]$') {
        $email = Select-AccountInteractive -App $App -Config $Config
        Set-AccountMapping -Config $Config -App $App -Email $email
        if (-not (Invoke-FirebaseLoginUse $email)) { throw "login:use that bai" }
        Use-FirebaseProject -ProjectId $App.firebaseProject -Config $Config -App $App
        Invoke-DeployCommands -RepoRoot $root -Kind ([string]$App.deploy) -FullDeploy:$FullDeploy | Out-Null
        $ok = $true
      }
    }

    if (-not $ok) {
      throw @"
firebase deploy that bai (exit $code).
Project: $($App.firebaseProject)
Account dang dung khong co quyen.
Fix: firebase login:add (dung Google so huu project) roi chay lai, chon dung TK cho yana-app.
"@
    }
  }

  $ver2 = Get-VersionLabel $root
  $url = if ($App.siteUrl) { $App.siteUrl } elseif ($App.firebaseProject) { "https://$($App.firebaseProject).web.app" } else { "" }
  Write-Host ""
  Write-Host "XONG — $($App.label)" -ForegroundColor Green
  if ($ver2) { Write-Host "  Version: $ver2" -ForegroundColor Green }
  if ($url) { Write-Host "  Site: $url" -ForegroundColor Green }
}
