# =============================================================================
# deploy-lib.ps1 — Cong cu deploy Firebase da app / da tai khoan (ban hoan chinh)
# Luong: chon app -> doi TK -> git pull -> build -> firebase deploy --project
# =============================================================================

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
  $Config = Repair-DeployConfigObject $Config
  $path = Join-Path $PSScriptRoot "deploy-apps.local.json"
  $json = $Config | ConvertTo-Json -Depth 10
  [System.IO.File]::WriteAllText($path, $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
  Write-Host "Da luu: $path" -ForegroundColor DarkGray
}

function Repair-DeployConfigObject {
  param([object]$Config)
  $keep = @("xuanquynh", "xuan-quynh", "apartment", "hotel_app_firebase", "hotel-xuan-quynh")
  $goodApps = @()
  $extraEx = @()

  foreach ($item in @($Config.apps)) {
    if ($null -eq $item) { continue }
    if ($item -is [string]) {
      $s = [string]$item
      if (-not $s) { continue }
      $low = $s.ToLowerInvariant()
      if ($low -eq "hotel") { continue }
      $keepHit = $false
      foreach ($k in $keep) { if ($low.Contains($k)) { $keepHit = $true; break } }
      if (-not $keepHit) { $extraEx += $s }
      continue
    }
    try {
      if ($item.id -or $item.label -or $null -ne $item.path) { $goodApps += $item }
    } catch {}
  }

  $ex = @()
  foreach ($r in @($Config.exclude)) {
    if (-not $r) { continue }
    $s = [string]$r
    $low = $s.ToLowerInvariant()
    if ($low -eq "hotel") { continue }
    $keepHit = $false
    foreach ($k in $keep) { if ($low.Contains($k)) { $keepHit = $true; break } }
    if ($keepHit) { continue }
    $ex += $s
  }
  foreach ($s in $extraEx) {
    if (-not ($ex | Where-Object { "$_" -eq $s })) { $ex += $s }
  }

  if (-not ($goodApps | Where-Object { $_.id -eq "quan-ly-du-an" -or $_.firebaseProject -eq "quan-ly-du-an-7d651" })) {
    $goodApps = @(
      [pscustomobject]@{
        id = "quan-ly-du-an"; label = "Quan ly du an"; path = ""; branch = "main"
        firebaseProject = "quan-ly-du-an-7d651"; deploy = "hosting"
        siteUrl = "https://quan-ly-du-an-7d651.web.app"
      }
    ) + $goodApps
  }

  $Config | Add-Member apps $goodApps -Force
  $Config | Add-Member exclude $ex -Force
  return $Config
}

function Read-DeployConfig {
  $path = Get-DeployConfigPath
  if (-not (Test-Path -LiteralPath $path)) {
    $example = Join-Path $PSScriptRoot "deploy-apps.config.example.json"
    if (Test-Path -LiteralPath $example) {
      Copy-Item $example $path
      Write-Host "Da tao config: $path" -ForegroundColor Green
    } else {
      throw "Khong tim thay config deploy."
    }
  }

  $raw = Get-Content -LiteralPath $path -Raw -Encoding UTF8
  try {
    $cfg = $raw | ConvertFrom-Json
  } catch {
    $bak = "$path.broken-$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
    Copy-Item -LiteralPath $path $bak -Force
    Write-Host "Config JSON hong — backup $bak, tao lai." -ForegroundColor Yellow
    $example = Join-Path $PSScriptRoot "deploy-apps.local.example.json"
    if (-not (Test-Path -LiteralPath $example)) {
      $example = Join-Path $PSScriptRoot "deploy-apps.config.example.json"
    }
    $path = Join-Path $PSScriptRoot "deploy-apps.local.json"
    Copy-Item $example $path -Force
    $cfg = Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json
  }

  foreach ($name in @("accounts", "apps", "exclude", "scanRoots")) {
    if (-not $cfg.PSObject.Properties[$name]) { $cfg | Add-Member $name @() -Force }
  }
  if (-not $cfg.PSObject.Properties["accountByPath"]) {
    $cfg | Add-Member accountByPath ([pscustomobject]@{}) -Force
  }
  if (-not $cfg.PSObject.Properties["discoverCursor"]) {
    $cfg | Add-Member discoverCursor $true -Force
  }

  $before = ($cfg.apps | ConvertTo-Json -Compress -Depth 5)
  $cfg = Repair-DeployConfigObject $cfg
  $after = ($cfg.apps | ConvertTo-Json -Compress -Depth 5)
  if ($before -ne $after) {
    $local = Join-Path $PSScriptRoot "deploy-apps.local.json"
    [System.IO.File]::WriteAllText($local, (($cfg | ConvertTo-Json -Depth 10) + [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
    Write-Host "Da sua config bi hong -> $local" -ForegroundColor Green
  }
  return $cfg
}

# ----- Firebase accounts -----

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
  if ($emails.Count -eq 0) { Write-Host "  (chua co)" -ForegroundColor Yellow }
  else { foreach ($e in $emails) { Write-Host "  - $e" } }
  Write-Host ""
}

function Invoke-FirebaseLoginUse {
  param(
    [string]$Email,
    [switch]$AutoAdd
  )
  if (-not $Email) { return $false }

  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $out = firebase login:use $Email 2>&1 | Out-String
    $text = $out.TrimEnd()
    if ($text) { Write-Host $text }
    if ($LASTEXITCODE -eq 0) { return $true }
    if ($text -match '(?i)Already using account') { return $true }

    # Account chua co tren may — can login:add (mo trinh duyet, 1 lan)
    $missing = ($text -match '(?i)does not exist|not found|valid accounts')
    $alreadyListed = (@(Get-FirebaseEmails) -contains $Email)

    if (($missing -or -not $alreadyListed) -and $AutoAdd) {
      Write-Host ""
      Write-Host "Tai khoan $Email chua dang nhap tren may nay." -ForegroundColor Yellow
      Write-Host "Khong can logout account khac — Firebase giu nhieu TK cung luc." -ForegroundColor DarkGray
      Write-Host "Se mo trinh duyet de login $Email (chi 1 lan)..." -ForegroundColor Cyan
      Write-Host ""
      $go = Read-Host "Enter = mo trinh duyet login, Q = huy"
      if ($go -match '^[Qq]$') { return $false }

      # firebase login:add mo browser OAuth — user chon dung Google account
      firebase login:add 2>&1 | Out-Host

      $emails = @(Get-FirebaseEmails)
      if ($emails -notcontains $Email) {
        Write-Host ""
        Write-Host "Chua thay $Email trong firebase login:list." -ForegroundColor Red
        Write-Host "Ban phai chon DUNG Google account $Email trong cua so login." -ForegroundColor Yellow
        Write-Host "Tai khoan hien co:" -ForegroundColor DarkGray
        foreach ($e in $emails) { Write-Host "  - $e" }
        $retry = Read-Host "Enter = thu login:add lai, Q = huy"
        if ($retry -match '^[Qq]$') { return $false }
        firebase login:add 2>&1 | Out-Host
      }

      $out2 = firebase login:use $Email 2>&1 | Out-String
      $text2 = $out2.TrimEnd()
      if ($text2) { Write-Host $text2 }
      if ($LASTEXITCODE -eq 0) { return $true }
      if ($text2 -match '(?i)Already using account') { return $true }
      return $false
    }

    return $false
  } finally {
    $ErrorActionPreference = $prev
  }
}

# ----- Cursor discovery -----

function ConvertFrom-FileUri {
  param([string]$Uri)
  if (-not $Uri) { return $null }
  $u = $Uri.Trim()
  if ($u -notmatch '^file:') { return $u }
  try {
    $decoded = [System.Uri]::UnescapeDataString(($u -replace '^file:///', '' -replace '^file://', ''))
    if ($decoded -match '^[A-Za-z]:') { return ($decoded -replace '/', '\') }
    if ($decoded.StartsWith('/')) { return $decoded }
    return ($decoded -replace '/', '\')
  } catch { return $null }
}

function Get-CursorFolderInfos {
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
      try { $r = [System.IO.Path]::GetFullPath($r) } catch {}
      $t = if ($when) { [datetime]$when } else { [datetime]::MinValue }
      if (-not $map.ContainsKey($r) -or $t -gt $map[$r]) { $map[$r] = $t }
    } catch {}
  }

  $roots = @()
  if ($env:APPDATA) {
    $roots += (Join-Path $env:APPDATA "Cursor\User")
    $roots += (Join-Path $env:APPDATA "Cursor - Insiders\User")
  }
  if ($env:HOME) {
    $roots += (Join-Path $env:HOME ".config/Cursor/User")
    $roots += (Join-Path $env:HOME "Library/Application Support/Cursor/User")
  }

  foreach ($userRoot in ($roots | Select-Object -Unique)) {
    if (-not (Test-Path -LiteralPath $userRoot)) { continue }
    $ws = Join-Path $userRoot "workspaceStorage"
    if (Test-Path -LiteralPath $ws) {
      Get-ChildItem -LiteralPath $ws -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $wj = Join-Path $_.FullName "workspace.json"
        if (Test-Path -LiteralPath $wj) {
          try {
            $data = Get-Content -LiteralPath $wj -Raw -Encoding UTF8 | ConvertFrom-Json
            $when = $_.LastWriteTime
            $db = Join-Path $_.FullName "state.vscdb"
            if (Test-Path -LiteralPath $db) {
              $dbi = Get-Item -LiteralPath $db
              if ($dbi.LastWriteTime -gt $when) { $when = $dbi.LastWriteTime }
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
  $rules = @($Config.exclude | Where-Object { $_ })
  if ($rules.Count -eq 0) { return $false }
  $path = [string]$App.path
  $leaf = if ($path) { Split-Path $path -Leaf } else { "" }
  $checks = @($path, [string]$App.id, [string]$App.label, $leaf, [string]$App.firebaseProject) | Where-Object { $_ }
  foreach ($rule in $rules) {
    $r = ([string]$rule).ToLowerInvariant()
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

function Get-AppRank {
  param([object]$App, [hashtable]$CursorTimes)
  $score = 0L
  $recency = [datetime]::MinValue
  if ($CursorTimes -and $CursorTimes.ContainsKey($App.path)) {
    $recency = [datetime]$CursorTimes[$App.path]
  } elseif (Test-Path -LiteralPath $App.path) {
    try { $recency = (Get-Item -LiteralPath $App.path).LastWriteTime } catch {}
  }
  $score += [int64]($recency.Ticks / 10000000)
  $p = ([string]$App.path).ToLowerInvariant()
  $src = if ($App.source) { [string]$App.source } else { "" }
  if ($src -eq "cursor") { $score += 100000000 }
  if ($p -match 'github') { $score += 50000000 }
  if ($p -match 'xuanquynh') { $score += 40000000 }
  if ($p -match '^[a-z]:\\hotel_app_firebase') { $score -= 30000000 }
  return $score
}

function New-DiscoveredApp {
  param([string]$Path, [object]$Config, [string]$Source)
  $name = Split-Path $Path -Leaf
  $id = ($name -replace '[^a-zA-Z0-9\-]+', '-').ToLowerInvariant()
  if (-not $id) { $id = "app" }
  $project = Get-FirebaseProjectId $Path
  $email = Get-AccountEmailForPath $Config $Path
  return [pscustomobject]@{
    id = $id; label = $name; path = $Path; branch = "main"
    firebaseProject = $project; accountEmail = $email; deploy = "hosting"
    siteUrl = $(if ($project) { "https://$project.web.app" } else { "" })
    source = $Source
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

function Get-DeployApps {
  param([object]$Config)

  $cursorInfos = @(Get-CursorFolderInfos)
  $cursorTimes = @{}
  foreach ($info in $cursorInfos) { $cursorTimes[$info.Path] = $info.LastUsed }

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
        $app | Add-Member accountEmail (Get-AccountEmailForPath $Config $p) -Force
      }
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
  foreach ($root in @($Config.scanRoots)) {
    if (-not $root) { continue }
    if (Test-Path -LiteralPath $root) {
      [void]$scan.Add((Resolve-Path -LiteralPath $root).Path)
      Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        [void]$scan.Add($_.FullName)
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

  # 1 project Firebase = 1 app trong menu
  $byProject = @{}
  $noProject = @()
  foreach ($app in $list) {
    $proj = [string]$app.firebaseProject
    if (-not $proj) { $noProject += $app; continue }
    if (-not $byProject.ContainsKey($proj)) {
      $byProject[$proj] = $app
    } elseif ([int64]$app.rank -gt [int64]$byProject[$proj].rank) {
      try { Add-ExcludeRule -Config $Config -Rule ([string]$byProject[$proj].path) } catch {}
      $byProject[$proj] = $app
    } else {
      try { Add-ExcludeRule -Config $Config -Rule ([string]$app.path) } catch {}
    }
  }
  return @((@($byProject.Values) + $noProject) | Sort-Object @{ Expression = { [int64]$_.rank }; Descending = $true })
}

# ----- Account mapping -----

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

function Select-AccountInteractive {
  param([object]$App, [object]$Config)
  $emails = @(Get-FirebaseEmails)
  Write-Host ""
  Write-Host "Chon tai khoan Firebase cho: $($App.label)" -ForegroundColor Yellow
  Write-Host "  $($App.path)" -ForegroundColor DarkGray
  if ($emails.Count -eq 0) { throw "Chua co TK. Bam M > T de login:add" }
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
  throw "Lua chon khong hop le"
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

# ----- Project + deploy -----

function Set-AppFirebaseRc {
  param([string]$RepoRoot, [string]$ProjectId)
  if (-not $ProjectId) { return }
  $rcPath = Join-Path $RepoRoot ".firebaserc"
  $obj = [pscustomobject]@{ projects = [pscustomobject]@{ default = $ProjectId } }
  if (Test-Path -LiteralPath $rcPath) {
    try {
      $old = Get-Content -LiteralPath $rcPath -Raw -Encoding UTF8 | ConvertFrom-Json
      if ($old.projects) {
        foreach ($p in $old.projects.PSObject.Properties) {
          if ($p.Name -ne "default") {
            $obj.projects | Add-Member -NotePropertyName $p.Name -NotePropertyValue $p.Value -Force
          }
        }
      }
    } catch {}
  }
  [System.IO.File]::WriteAllText($rcPath, (($obj | ConvertTo-Json -Depth 5) + [Environment]::NewLine), [System.Text.UTF8Encoding]::new($false))
}

function Test-FirebaseProjectAccess {
  param([string]$ProjectId, [string]$RepoRoot = "")
  $prev = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $pushed = $false
  try {
    if ($RepoRoot -and (Test-Path -LiteralPath $RepoRoot)) {
      Push-Location -LiteralPath $RepoRoot
      $pushed = $true
    }
    if ($RepoRoot -and $ProjectId) {
      try { Set-AppFirebaseRc -RepoRoot $RepoRoot -ProjectId $ProjectId } catch {}
    }
    $out = firebase use $ProjectId 2>&1 | Out-String
    $text = $out.TrimEnd()
    if ($text) { Write-Host $text }
    if ($LASTEXITCODE -eq 0) { return $true }
    if ($text -match '(?i)Now using project|Aliased') { return $true }
    if ($text -match '(?i)Invalid project selection|Failed to get Firebase project|do not have permission') {
      return $false
    }
    $listOut = firebase projects:list 2>&1 | Out-String
    if ($listOut -match [regex]::Escape($ProjectId)) { return $true }
    return $false
  } finally {
    if ($pushed) { Pop-Location }
    $ErrorActionPreference = $prev
  }
}

function Use-FirebaseProject {
  param(
    [string]$ProjectId,
    [object]$Config,
    [object]$App,
    [string]$RepoRoot = "",
    [switch]$Interactive
  )
  if (-not $ProjectId) { throw "Thieu Firebase project ID." }
  if (-not $RepoRoot -and $App -and $App.path) { $RepoRoot = [string]$App.path }

  Write-Host "Firebase project: $ProjectId" -ForegroundColor DarkCyan
  if ($RepoRoot) { Write-Host "  (thu muc: $RepoRoot)" -ForegroundColor DarkGray }

  if (Test-FirebaseProjectAccess -ProjectId $ProjectId -RepoRoot $RepoRoot) { return }

  $current = if ($App.accountEmail) { [string]$App.accountEmail } else { "" }
  if ($current -and $Interactive) {
    Write-Host "Khong chon duoc project bang $current (token CLI co the cu)." -ForegroundColor Yellow
    Write-Host "Neu Console van thay project: can reauth 1 lan cho account nay." -ForegroundColor Yellow
    $re = Read-Host "Enter = reauth, S = thu TK khac, Q = bo"
    if ($re -match '^[Qq]$') { throw "Huy deploy" }
    if ($re -notmatch '^[Ss]$') {
      Invoke-External -AllowFail -Command { firebase login --reauth } | Out-Null
      Invoke-FirebaseLoginUse -Email $current -AutoAdd | Out-Null
      if (Test-FirebaseProjectAccess -ProjectId $ProjectId -RepoRoot $RepoRoot) { return }
    }
  }

  foreach ($email in @(Get-FirebaseEmails)) {
    if ($email -eq $current) { continue }
    Write-Host "Thu account: $email" -ForegroundColor Yellow
    if (-not (Invoke-FirebaseLoginUse -Email $email -AutoAdd)) { continue }
    if (Test-FirebaseProjectAccess -ProjectId $ProjectId -RepoRoot $RepoRoot) {
      Set-AccountMapping -Config $Config -App $App -Email $email
      return
    }
  }
  throw "Khong truy cap duoc project '$ProjectId'. Thu: firebase login --reauth"
}

function Sync-Git {
  param([string]$RepoRoot, [string]$Branch, [switch]$SkipPull)
  if ($SkipPull) { Write-Host "Bo qua git pull" -ForegroundColor DarkYellow; return }
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot ".git"))) {
    Write-Host "Khong phai git repo — bo qua pull" -ForegroundColor DarkYellow
    return
  }
  Push-Location -LiteralPath $RepoRoot
  try {
    Write-Host "Git pull origin $Branch..." -ForegroundColor Yellow
    $fc = Invoke-External -AllowFail -Command { git fetch origin $Branch }
    if ($fc -ne 0) { Write-Host "git fetch loi — deploy code local" -ForegroundColor Yellow; return }
    $pc = Invoke-External -AllowFail -Command { git pull origin $Branch }
    if ($pc -ne 0) { Write-Host "git pull loi — deploy code local" -ForegroundColor Yellow }
  } finally { Pop-Location }
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
    throw "Thieu public\firebase-config.js — copy tu example"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot "node_modules"))) {
    Write-Host "npm install..." -ForegroundColor Yellow
    Push-Location -LiteralPath $RepoRoot
    try {
      Invoke-External -FailMessage "npm install that bai" -Command { npm install } | Out-Null
    } finally { Pop-Location }
  }
}

function Invoke-DeployCommands {
  param(
    [string]$RepoRoot,
    [string]$Kind,
    [string]$ProjectId = "",
    [switch]$FullDeploy,
    [switch]$AllowFail
  )
  Push-Location -LiteralPath $RepoRoot
  try {
    if (-not $ProjectId) { $ProjectId = Get-FirebaseProjectId $RepoRoot }
    if (-not $ProjectId) { throw "Khong co Firebase project ID" }

    Set-AppFirebaseRc -RepoRoot $RepoRoot -ProjectId $ProjectId
    Write-Host "[1/3] firebase use $ProjectId" -ForegroundColor Yellow
    $prev = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try { firebase use $ProjectId 2>&1 | Out-Host } finally { $ErrorActionPreference = $prev }

    $pkg = Get-Content -LiteralPath (Join-Path $RepoRoot "package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    $scripts = @()
    if ($pkg.scripts) { $scripts = @($pkg.scripts.PSObject.Properties.Name) }
    $env:GOOGLE_CLOUD_PROJECT = $ProjectId

    Write-Host "[2/3] Build..." -ForegroundColor Yellow
    $code = 0
    if ($scripts -contains "predeploy") {
      $code = Invoke-External -AllowFail -Command { npm run predeploy }
    } elseif ($scripts -contains "build") {
      $code = Invoke-External -AllowFail -Command { npm run build }
    } elseif ($scripts -contains "build:css") {
      Invoke-External -AllowFail -Command { npm run build:css } | Out-Null
    }
    if ($code -ne 0) {
      if (-not $AllowFail) { throw "build that bai (exit $code)" }
      return $code
    }

    $wantFull = $FullDeploy -or ($Kind -eq "all")
    Write-Host "[3/3] firebase deploy --project $ProjectId ..." -ForegroundColor Yellow
    if ($wantFull) {
      $code = Invoke-External -AllowFail -Command { firebase deploy --project $ProjectId }
    } else {
      $code = Invoke-External -AllowFail -Command { firebase deploy --only hosting --project $ProjectId }
    }
    if (-not $AllowFail -and $code -ne 0) { throw "firebase deploy that bai (exit $code)" }
    return $code
  } finally { Pop-Location }
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
      throw "Thieu '$cmd'. Cai Node.js + npm i -g firebase-tools"
    }
  }

  $root = Resolve-AppPath $App
  try { $root = [System.IO.Path]::GetFullPath($root) } catch {}
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
  Write-Host "Tu dong: doi TK -> git pull -> build -> hosting" -ForegroundColor DarkGray
  Write-Host ""

  Write-Host ">> Git pull..." -ForegroundColor Cyan
  Sync-Git -RepoRoot $root -Branch $branch -SkipPull:$SkipPull
  $ver = Get-VersionLabel $root
  if ($ver) { Write-Host "Version: $ver" -ForegroundColor Green }

  Write-Host ">> Kiem tra npm..." -ForegroundColor Cyan
  Ensure-Ready $root

  if ($account) {
    Write-Host ">> Doi TK Firebase -> $($account.email)" -ForegroundColor Cyan
    if (-not (Invoke-FirebaseLoginUse -Email $account.email -AutoAdd)) {
      throw "Khong doi duoc sang $($account.email). Can login dung Google account do trong trinh duyet."
    }
  }

  Write-Host ">> Chon project Firebase..." -ForegroundColor Cyan
  Use-FirebaseProject -ProjectId $App.firebaseProject -Config $Config -App $App -RepoRoot $root -Interactive:$Interactive

  Write-Host ">> Build + Deploy..." -ForegroundColor Cyan
  $code = Invoke-DeployCommands -RepoRoot $root -Kind ([string]$App.deploy) -ProjectId ([string]$App.firebaseProject) -FullDeploy:$FullDeploy -AllowFail

  if ($code -ne 0) {
    Write-Host "Deploy that bai — thu account khac..." -ForegroundColor Yellow
    Clear-AccountMapping -Config $Config -Path $root
    $App | Add-Member accountEmail "" -Force
    $tried = @(); if ($account) { $tried += $account.email }
    $ok = $false
    foreach ($email in @(Get-FirebaseEmails)) {
      if ($tried -contains $email) { continue }
      Write-Host "Thu: $email" -ForegroundColor Yellow
      if (-not (Invoke-FirebaseLoginUse -Email $email -AutoAdd)) { continue }
      if (-not (Test-FirebaseProjectAccess -ProjectId $App.firebaseProject -RepoRoot $root)) { continue }
      $code2 = Invoke-DeployCommands -RepoRoot $root -Kind ([string]$App.deploy) -ProjectId ([string]$App.firebaseProject) -FullDeploy:$FullDeploy -AllowFail
      if ($code2 -eq 0) {
        Set-AccountMapping -Config $Config -App $App -Email $email
        $ok = $true; break
      }
    }
    if (-not $ok -and $Interactive) {
      Write-Host "Can login dung Google so huu project." -ForegroundColor Yellow
      $go = Read-Host "Enter = chon / them TK, Q = dung"
      if ($go -notmatch '^[Qq]$') {
        Invoke-External -AllowFail -Command { firebase login --reauth } | Out-Null
        $email = Select-AccountInteractive -App $App -Config $Config
        Set-AccountMapping -Config $Config -App $App -Email $email
        Invoke-FirebaseLoginUse -Email $email -AutoAdd | Out-Null
        Use-FirebaseProject -ProjectId $App.firebaseProject -Config $Config -App $App -RepoRoot $root
        Invoke-DeployCommands -RepoRoot $root -Kind ([string]$App.deploy) -ProjectId ([string]$App.firebaseProject) -FullDeploy:$FullDeploy | Out-Null
        $ok = $true
      }
    }
    if (-not $ok) {
      throw "Deploy that bai (exit $code). Thu: firebase login --reauth roi chay lai."
    }
  }

  $ver2 = Get-VersionLabel $root
  $url = if ($App.siteUrl) { $App.siteUrl } elseif ($App.firebaseProject) { "https://$($App.firebaseProject).web.app" } else { "" }
  Write-Host ""
  Write-Host "XONG — $($App.label)" -ForegroundColor Green
  if ($ver2) { Write-Host "  Version: $ver2" -ForegroundColor Green }
  if ($url) { Write-Host "  Site: $url" -ForegroundColor Green }
}
