# Deploy du-an.zip (hoặc dist-du-an) lên server Nginx qua SCP/SSH.
# Ví dụ:
#   .\scripts\deploy-du-an-remote.ps1 -HostName 10.201.1.8 -User root -RemotePath /var/www/du-an
#   .\scripts\deploy-du-an-remote.ps1 -HostName 10.201.1.8 -User root -Mode docker -DockerContainer quan-ly-du-an-app
#
# Nếu thiếu key/password: SSH sẽ hỏi tương tác. BatchMode chỉ khi đã có key.

param(
  [Parameter(Mandatory = $true)][string]$HostName,
  [string]$User = "root",
  [string]$RemotePath = "/var/www/du-an",
  [string]$ZipPath = "",
  [ValidateSet("nginx", "docker")][string]$Mode = "nginx",
  [string]$DockerContainer = "quan-ly-du-an-app",
  [string]$DockerHtml = "/usr/share/nginx/html",
  [switch]$SkipPackage,
  [switch]$ReloadNginx
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $root

if (-not $ZipPath) { $ZipPath = Join-Path $root "du-an.zip" }

if (-not $SkipPackage) {
  if (-not (Test-Path (Join-Path $root "public\firebase-config.js"))) {
    throw "Thiếu public/firebase-config.js — không đóng gói được."
  }
  Write-Host "==> npm run package:du-an"
  npm run package:du-an
}

if (-not (Test-Path $ZipPath)) {
  throw "Không thấy zip: $ZipPath"
}

$target = "$User@$HostName"
$remoteZip = "/tmp/du-an-deploy.zip"

Write-Host "==> SCP $ZipPath -> ${target}:$remoteZip"
scp $ZipPath "${target}:$remoteZip"

if ($Mode -eq "docker") {
  $remoteCmd = @"
set -e
TMP=/tmp/du-an-extract
rm -rf "`$TMP" && mkdir -p "`$TMP"
unzip -o "$remoteZip" -d "`$TMP"
test -f "`$TMP/firebase-config.js" || { echo 'THIEU firebase-config.js trong zip'; exit 1; }
grep -Eq 'YOUR_API_KEY|YOUR_PROJECT_ID' "`$TMP/firebase-config.js" && { echo 'firebase-config.js con placeholder'; exit 1; }
docker cp "`$TMP/." "${DockerContainer}:${DockerHtml}/"
rm -rf "`$TMP" "$remoteZip"
curl -sI "http://127.0.0.1:8084/firebase-config.js" | head -5 || true
echo DEPLOY_DOCKER_OK
"@
} else {
  $reload = if ($ReloadNginx) { "sudo nginx -t && sudo systemctl reload nginx" } else { "echo skip_nginx_reload" }
  $remoteCmd = @"
set -e
sudo mkdir -p "$RemotePath"
TMP=/tmp/du-an-extract
rm -rf "`$TMP" && mkdir -p "`$TMP"
unzip -o "$remoteZip" -d "`$TMP"
test -f "`$TMP/firebase-config.js" || { echo 'THIEU firebase-config.js trong zip'; exit 1; }
grep -Eq 'YOUR_API_KEY|YOUR_PROJECT_ID' "`$TMP/firebase-config.js" && { echo 'firebase-config.js con placeholder'; exit 1; }
sudo rsync -a --delete "`$TMP"/ "$RemotePath"/
rm -rf "`$TMP" "$remoteZip"
$reload
echo DEPLOY_NGINX_OK
"@
}

Write-Host "==> SSH extract/deploy ($Mode)"
ssh $target $remoteCmd
Write-Host "Xong. Hard refresh trình duyệt (Ctrl+F5)."
