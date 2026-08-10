@echo off
REM ============================================================================
REM  DEPLOY TU DONG — 1 chạm: commit → git pull/merge → push → Firebase
REM  Double-click file này (hoặc shortcut Desktop) là đủ.
REM ============================================================================
chcp 65001 >nul
cd /d "%~dp0"
title Deploy Tu Dong — Quan ly du an

REM Timeout discovery Cloud Functions (mac dinh 10s thuong that bai tren Windows)
set FUNCTIONS_DISCOVERY_TIMEOUT=60

echo.
echo ========================================
echo   DEPLOY TU DONG
echo   commit + pull/merge + push + Firebase
echo ========================================
echo.

where powershell >nul 2>&1
if errorlevel 1 (
  echo [LOI] Khong tim thay PowerShell.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-auto.ps1" %*
set ERR=%ERRORLEVEL%

echo.
if %ERR% neq 0 (
  echo Ket thuc voi ma loi %ERR%.
) else (
  echo Hoan tat.
)
pause
exit /b %ERR%
