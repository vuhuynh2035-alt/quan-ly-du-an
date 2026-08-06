@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Ban cu — goi file moi
call "%~dp0Chay-Deploy.bat" %*
