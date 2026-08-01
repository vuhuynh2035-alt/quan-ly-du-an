# Reset mat khau tai khoan qua Firebase Admin SDK.
# Yeu cau: da dang nhap Firebase CLI (firebase login) HOAC dat GOOGLE_APPLICATION_CREDENTIALS.
#
# PowerShell:
#   .\scripts\reset-user-password.ps1 -Username "giamdoc" -Password "MatKhauMoi123"
#   .\scripts\reset-user-password.ps1 -Username "phuong" -Password "MatKhauMoi123" -Org saree

param(
  [Parameter(Mandatory = $true)]
  [string]$Username,
  [Parameter(Mandatory = $true)]
  [string]$Password,
  [string]$Org = "cong-trinh"
)

Set-Location $PSScriptRoot

if ($Password.Length -lt 6) {
  Write-Host "Loi: mat khau can it nhat 6 ky tu." -ForegroundColor Red
  exit 1
}

$login = $Username.Trim().ToLower()
if ($login.Length -lt 2) {
  Write-Host "Loi: ten dang nhap can it nhat 2 ky tu." -ForegroundColor Red
  exit 1
}

# Email moi: user@qlcv.local ; legacy: org.user@qlcv.local
$email = "$login@qlcv.local"
$legacyEmail = "$Org.$login@qlcv.local"
$fnDir = Join-Path $PSScriptRoot ".." "functions"
$adminPath = Join-Path $fnDir "node_modules" "firebase-admin"

if (-not (Test-Path $adminPath)) {
  Write-Host "Chua co firebase-admin. Chay: cd functions; npm install" -ForegroundColor Yellow
  exit 1
}

$nodeScript = @"
const path = require('path');
const admin = require(path.join(process.argv[2], 'firebase-admin'));
const email = process.argv[3];
const legacyEmail = process.argv[4];
const password = process.argv[5];
admin.initializeApp();
function reset(e) {
  return admin.auth().getUserByEmail(e)
    .then(function (u) { return admin.auth().updateUser(u.uid, { password: password }).then(function () { return e; }); });
}
reset(email)
  .catch(function (err) {
    if (err && err.code === 'auth/user-not-found' && legacyEmail) return reset(legacyEmail);
    throw err;
  })
  .then(function (used) { console.log('OK: da dat lai mat khau cho ' + used); process.exit(0); })
  .catch(function (err) {
    if (err && err.code === 'auth/user-not-found') {
      console.error('Khong tim thay ' + email + ' hoac ' + legacyEmail);
    } else {
      console.error(err.message || err);
    }
    process.exit(1);
  });
"@

$tmp = [System.IO.Path]::GetTempFileName() + ".js"
Set-Content -Path $tmp -Value $nodeScript -Encoding UTF8

Write-Host "Dat lai mat khau: $email (fallback $legacyEmail)" -ForegroundColor Cyan
node $tmp $fnDir $email $legacyEmail $Password
$code = $LASTEXITCODE
Remove-Item $tmp -Force -ErrorAction SilentlyContinue
exit $code
