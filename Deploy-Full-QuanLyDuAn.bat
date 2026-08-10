@echo off
REM Chuyen sang Deploy Tu Dong (commit + git sync + hosting + functions)
chcp 65001 >nul
cd /d "%~dp0"
call "%~dp0Deploy-TuDong.bat" %*
exit /b %ERRORLEVEL%
