@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  ========================================
echo   DEPLOY FIREBASE — nhieu app / nhieu TK
echo  ========================================
echo   Thu muc: %~dp0
echo.
echo   Tu dong liet ke project Firebase trong Cursor.
echo   Chon so -^> doi tai khoan Firebase -^> git pull -^> deploy.
echo.
echo   Lenh: deploy.bat          (menu)
echo         deploy.bat 1        (app so 1)
echo         deploy.bat S        (huong dan)
echo         deploy.bat L        (list tai khoan)
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
