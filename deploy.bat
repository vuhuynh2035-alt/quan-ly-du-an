@echo off
chcp 65001 >nul
cd /d "%~dp0"

where powershell >nul 2>&1
if errorlevel 1 (
  echo [Loi] Khong tim thay PowerShell.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-select.ps1" %*
set EXITCODE=%ERRORLEVEL%

echo.
if %EXITCODE% neq 0 echo [Ket thuc] Co loi — ma: %EXITCODE%
pause
exit /b %EXITCODE%
