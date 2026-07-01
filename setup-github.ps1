# Setup GitHub — chạy trên Máy 1 (một lần)
# PowerShell: .\setup-github.ps1

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=== Setup GitHub cho Quan ly du an ===" -ForegroundColor Cyan

# 1. Kiểm tra đăng nhập GitHub CLI
gh auth status 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Chua dang nhap GitHub. Dang mo trinh duyet..." -ForegroundColor Yellow
    gh auth login --hostname github.com --git-protocol https --web
}

# 2. Tên repo
$repoName = "quan-ly-du-an"
$user = gh api user -q .login
$remote = "https://github.com/$user/$repoName.git"

Write-Host ""
Write-Host "Tai khoan: $user" -ForegroundColor Green
Write-Host "Repo: $remote"

# 3. Tạo repo (private)
gh repo view "$user/$repoName" 2>$null | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Dang tao repo tren GitHub..." -ForegroundColor Cyan
    gh repo create $repoName --private --source=. --remote=origin --description "Quan ly du an SAREE"
} else {
    Write-Host ""
    Write-Host "Repo da ton tai, gan remote..." -ForegroundColor Yellow
    git remote remove origin 2>$null
    git remote add origin $remote
}

# 4. Push
Write-Host ""
Write-Host "Dang push len GitHub..." -ForegroundColor Cyan
git push -u origin main

Write-Host ""
Write-Host "=== XONG ===" -ForegroundColor Green
Write-Host "URL: https://github.com/$user/$repoName"
Write-Host ""
Write-Host "May 2 — clone:"
Write-Host "  git clone $remote"
Write-Host "  cd $repoName"
Write-Host "  npm install"
