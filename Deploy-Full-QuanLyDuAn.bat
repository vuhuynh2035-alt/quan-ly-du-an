@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Deploy Quan ly du an — hosting + functions

echo ========================================
echo  Deploy Quan ly du an (FULL)
echo  hosting + Cloud Functions
echo  Bat buoc: code = origin/main moi nhat
echo ========================================
echo.

where git >nul 2>&1 || (echo Thieu git. & pause & exit /b 1)
where node >nul 2>&1 || (echo Thieu Node.js. & pause & exit /b 1)
where npm >nul 2>&1 || (echo Thieu npm. & pause & exit /b 1)

echo [1/6] git fetch + checkout main + ff-only ...
git fetch origin main
if errorlevel 1 (
  echo git fetch loi — DUNG deploy code cu.
  pause
  exit /b 1
)
git checkout main
if errorlevel 1 (
  echo Khong checkout duoc main. Commit/stash local roi thu lai.
  pause
  exit /b 1
)
git merge --ff-only origin/main
if errorlevel 1 (
  echo Local lech origin/main — DUNG deploy code cu.
  pause
  exit /b 1
)

for /f %%i in ('git rev-parse --short HEAD') do set HEADSHA=%%i
for /f %%i in ('git rev-parse --short origin/main') do set MAINSHA=%%i
if not "%HEADSHA%"=="%MAINSHA%" (
  echo HEAD %HEADSHA% khac origin/main %MAINSHA% — dung deploy.
  pause
  exit /b 1
)
echo OK git main @%HEADSHA%
git log -1 --oneline
echo.

echo [2/6] Kiem tra code moi trong index.html ...
findstr /C:"projView" /C:"isProjLocked" index.html >nul
if errorlevel 1 (
  echo.
  echo LOI: index.html chua co code Hoan thanh / khoa du an.
  echo Hay merge PR va chay lai file nay.
  pause
  exit /b 1
)
echo OK — tim thay projView + isProjLocked.

echo.
echo [3/6] firebase use project ...
call npx -y firebase-tools@latest use quan-ly-du-an-7d651
if errorlevel 1 (
  echo Can firebase login...
  call npx -y firebase-tools@latest login
  call npx -y firebase-tools@latest use quan-ly-du-an-7d651
)

echo.
echo [4/6] Build ^(vite^) — luon tao dist moi ...
call npm run build
if errorlevel 1 (
  echo BUILD THAT BAI.
  pause
  exit /b 1
)
findstr /C:"projView" /C:"isProjLocked" dist\index.html >nul
if errorlevel 1 (
  echo LOI: dist\index.html thieu code moi — khong deploy.
  pause
  exit /b 1
)

echo.
echo [5/6] Deploy HOSTING ...
call npx -y firebase-tools@latest deploy --only hosting
if errorlevel 1 (
  echo HOSTING THAT BAI.
  pause
  exit /b 1
)

echo.
echo [6/6] Deploy FUNCTIONS ...
call npx -y firebase-tools@latest deploy --only functions
if errorlevel 1 (
  echo FUNCTIONS THAT BAI — hosting da len, can chay lai functions.
  pause
  exit /b 1
)

echo.
echo ========================================
echo  XONG — commit %HEADSHA%
echo  Site: https://quan-ly-du-an-7d651.web.app
echo  Mo app → Ctrl+F5 → kiem tra tinh nang
echo  Xem version goc tren /app-version.json
echo ========================================
pause
