@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM Menu deploy da app.
REM Quan ly du an: nen dung Deploy-Full-QuanLyDuAn.bat (main ff-only + hosting + functions).
REM Tool nay cung da bat buoc sync git ff-only; QLDA tu dong deploy hosting+functions.
call "%~dp0Chay-Deploy.bat" %*
