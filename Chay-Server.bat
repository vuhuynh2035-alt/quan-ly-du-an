@echo off
chcp 65001 >nul
title May Chu Quan Ly Du An SAREE - HPG2Z4 (Port 8084)
cd /d "%~dp0"

echo ==============================================================
echo    KHOI DONG MAY CHU QUAN LY DU AN SAREE (MAY HP)
echo ==============================================================
echo.

if not exist "node_modules" (
    echo [THONG BAO] Dang cai dat thu vien ban dau...
    call npm install
)

if not exist "dist\index.html" (
    echo [THONG BAO] Dang bien dich ban build san pham...
    call npm run build
)

echo Dang khoi dong trinh duyet...
start "" http://localhost:8084

echo Dang khoi chay may chu Node.js...
node server.js
pause
