@echo off
chcp 65001 >nul
title May Chu Quan Ly Du An SAREE - HPG2Z4 (Port 8084)
cd /d "%~dp0"

echo ==============================================================
echo    KHOI DONG MAY CHU QUAN LY DU AN SAREE (MAY HP)
echo ==============================================================
echo.

if not exist "public\firebase-config.js" (
    echo [LOI] Thieu public\firebase-config.js. Hay sao chep cau hinh Firebase that len HP.
    pause
    exit /b 1
)
findstr /c:"YOUR_API_KEY" /c:"YOUR_PROJECT_ID" "public\firebase-config.js" >nul
if not errorlevel 1 (
    echo [LOI] public\firebase-config.js van con gia tri mau.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo [THONG BAO] Dang cai dat thu vien ban dau...
    call npm install
    if errorlevel 1 (
        echo [LOI] Khong cai dat duoc thu vien.
        pause
        exit /b 1
    )
)

echo Dang bien dich ban build tu ma nguon...
call node_modules\.bin\vite.cmd build
if errorlevel 1 (
    echo [LOI] Build that bai. May chu chua duoc khoi dong.
    pause
    exit /b 1
)
if not exist "dist\firebase-config.js" (
    echo [LOI] Build xong nhung khong co dist\firebase-config.js.
    pause
    exit /b 1
)

echo Dang khoi dong trinh duyet...
start "" http://localhost:8084

echo Dang khoi chay may chu Node.js...
node server.js
pause
