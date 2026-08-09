@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Deploy Quan ly du an — hosting + functions

echo ========================================
echo  Deploy Quan ly du an (FULL)
echo  hosting + Cloud Functions
echo ========================================
echo.

where git >nul 2>&1 || (echo Thieu git. & pause & exit /b 1)
where node >nul 2>&1 || (echo Thieu Node.js. & pause & exit /b 1)
where npm >nul 2>&1 || (echo Thieu npm. & pause & exit /b 1)

echo [1/5] git fetch + checkout main + pull ...
git fetch origin main
git checkout main
git pull origin main
if errorlevel 1 (
  echo git pull loi.
  pause
  exit /b 1
)

echo.
echo [2/5] Kiem tra code hoan thanh theo hang muc ...
findstr /C:"projView" /C:"isProjLocked" /C:"saveProjCompleteItems" /C:"projCompleteItemsM" index.html >nul
if errorlevel 1 (
  echo.
  echo LOI: index.html chua co code tick hang muc hoan thanh.
  echo Hay merge PR va git pull lai.
  pause
  exit /b 1
)
echo OK — tim thay projView + isProjLocked + saveProjCompleteItems.

echo.
echo [3/5] firebase use project ...
call npx -y firebase-tools@latest use quan-ly-du-an-7d651
if errorlevel 1 (
  echo Can firebase login...
  call npx -y firebase-tools@latest login
  call npx -y firebase-tools@latest use quan-ly-du-an-7d651
)

echo.
echo [4/5] Deploy HOSTING ...
call npm run deploy:hosting
if errorlevel 1 (
  echo HOSTING THAT BAI.
  pause
  exit /b 1
)

echo.
echo [5/5] Deploy FUNCTIONS ...
call npm run deploy:functions
if errorlevel 1 (
  echo FUNCTIONS THAT BAI — hosting da len, can chay lai functions.
  pause
  exit /b 1
)

echo.
echo ========================================
echo  XONG
echo  Site: https://quan-ly-du-an-7d651.web.app
echo  Mo app → Ctrl+F5 → tab Du an
echo  Phai thay 2 nut:  Dang lam  |  Hoan thanh
echo  Version can ^>= v1.079
echo  Giam doc: Chi tiet du an -^> Hoan thanh -^> tick hang muc
echo ========================================
pause
