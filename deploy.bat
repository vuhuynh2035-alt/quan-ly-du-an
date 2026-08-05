@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  ========================================
echo   Cong cu deploy Firebase (chon chuong trinh)
echo  ========================================
echo   Thu muc: %~dp0
echo   Menu:    %~dp0scripts\deploy-select.ps1
echo   Config:  %~dp0scripts\deploy-apps.config.json
echo.
echo   Lenh nhanh: deploy.bat quan-ly-du-an
echo               deploy.bat A
echo               deploy.bat S   (huong dan cau hinh)
echo               deploy.bat quan-ly-du-an -SkipPull
echo.

where powershell >nul 2>&1
if errorlevel 1 (
  echo [Loi] Khong tim thay PowerShell.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\deploy-select.ps1" %*
set EXITCODE=%ERRORLEVEL%

echo.
if %EXITCODE% neq 0 (
  echo [Ket thuc] Co loi — ma thoat: %EXITCODE%
) else (
  echo [Ket thuc] Xong.
)
pause
exit /b %EXITCODE%
