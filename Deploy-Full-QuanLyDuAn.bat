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

echo [1/4] git pull origin main ...
git pull origin main
if errorlevel 1 (
  echo.
  echo git pull loi — van tiep tuc deploy code local.
  echo Neu PR #13 chua merge: merge tren GitHub truoc, roi chay lai file nay.
  echo.
)

echo.
echo [2/4] firebase login ^(neu da login se bo qua^) ...
call npx -y firebase-tools@latest login --no-localhost
call npx -y firebase-tools@latest use quan-ly-du-an-7d651

echo.
echo [3/4] Deploy HOSTING ...
call npm run deploy:hosting
if errorlevel 1 (
  echo.
  echo HOSTING THAT BAI.
  pause
  exit /b 1
)

echo.
echo [4/4] Deploy FUNCTIONS ...
call npm run deploy:functions
if errorlevel 1 (
  echo.
  echo FUNCTIONS THAT BAI — hosting da len, can chay lai functions.
  pause
  exit /b 1
)

echo.
echo ========================================
echo  XONG — hosting + functions
echo  Site: https://quan-ly-du-an-7d651.web.app
echo  Mo app roi Ctrl+F5 ^(version v1.075+^)
echo ========================================
pause
