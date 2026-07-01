# Setup GitHub - chay tren May 1 (mot lan)
# PowerShell: .\setup-github.ps1

Set-Location $PSScriptRoot

Write-Host "=== Setup GitHub ===" -ForegroundColor Cyan

$prevErr = $ErrorActionPreference
$ErrorActionPreference = "SilentlyContinue"
gh auth status 2>&1 | Out-Null
$loggedIn = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevErr

if (-not $loggedIn) {
    Write-Host "Chua dang nhap GitHub. Mo trinh duyet va nhap ma..." -ForegroundColor Yellow
    gh auth login --hostname github.com --git-protocol https --web
    if ($LASTEXITCODE -ne 0) { exit 1 }
}

$user = gh api user -q .login
if ($LASTEXITCODE -ne 0) { Write-Host "Loi: chua dang nhap GitHub"; exit 1 }

$repoName = "quan-ly-du-an"
$remote = "https://github.com/$user/$repoName.git"

Write-Host "Tai khoan: $user" -ForegroundColor Green
Write-Host "Repo: $remote"

$ErrorActionPreference = "SilentlyContinue"
gh repo view "$user/$repoName" 2>&1 | Out-Null
$repoExists = ($LASTEXITCODE -eq 0)
$ErrorActionPreference = $prevErr

if (-not $repoExists) {
    Write-Host "Tao repo private tren GitHub..." -ForegroundColor Cyan
    gh repo create $repoName --private --source=. --remote=origin --description "Quan ly du an SAREE"
} else {
    Write-Host "Repo da ton tai." -ForegroundColor Yellow
    git remote remove origin 2>$null
    git remote add origin $remote
}

if ($LASTEXITCODE -ne 0) { Write-Host "Loi tao repo"; exit 1 }

Write-Host "Push len GitHub..." -ForegroundColor Cyan
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "XONG: https://github.com/$user/$repoName" -ForegroundColor Green
    Write-Host "May 2: git clone $remote"
} else {
    Write-Host "Loi push. Thu lai: git push -u origin main"
    exit 1
}
