@echo off
chcp 65001 >nul
title Deploy App
cd /d "%~dp0"

REM ============================================================
REM  CHAY DEPLOY — double-click file nay (khong can mo PowerShell)
REM  Hoac double-click shortcut "Deploy App" tren Desktop
REM ============================================================

where powershell >nul 2>&1
if errorlevel 1 (
  echo [Loi] Khong tim thay PowerShell.
  pause
  exit /b 1
)

if not exist "%~dp0scripts\deploy-select.ps1" (
  echo [Loi] Thieu scripts\deploy-select.ps1
  echo Hay chay: git pull origin main
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-select.ps1" %*
set EXITCODE=%ERRORLEVEL%

echo.
if %EXITCODE% neq 0 echo [Ket thuc] Co loi — ma: %EXITCODE%
pause
exit /b %EXITCODE%
