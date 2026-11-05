@echo off
chcp 65001 >nul
title Mo Tuong Lua Windows cho May Chu Quan Ly Du An SAREE (Port 8084)
cd /d "%~dp0"

echo ==============================================================
echo   DANG MO CONG 8084 TREN TUONG LUA WINDOWS CHO MAY HP
echo ==============================================================
echo.

netsh advfirewall firewall delete rule name="Quan Ly Du An SAREE (Port 8084)" >nul 2>&1
netsh advfirewall firewall add rule name="Quan Ly Du An SAREE (Port 8084)" dir=in action=allow protocol=TCP localport=8084

if %errorlevel% equ 0 (
    echo [THANH CONG] Da mo cong 8084 tren Tuong lua Windows!
    echo Cac thiet bi khac (dien thoai, may tinh bang, laptop) trong cung mang Wi-Fi
    echo gio day da co the ket noi vao may chu HP nay tai dia chi http://^<IP_MAY_HP^>:8084
) else (
    echo [LUU Y] Ban can nhap chuot phai vao file nay va chon "Run as administrator" de cap quyen!
)

echo.
pause
