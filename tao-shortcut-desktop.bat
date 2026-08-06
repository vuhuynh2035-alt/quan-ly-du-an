@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Tao shortcut "Deploy App" tren Desktop...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root='%~dp0'; $bat=Join-Path $root 'deploy.bat'; $desk=[Environment]::GetFolderPath('Desktop'); $lnk=Join-Path $desk 'Deploy App.lnk'; $w=New-Object -ComObject WScript.Shell; $s=$w.CreateShortcut($lnk); $s.TargetPath=$bat; $s.WorkingDirectory=$root.TrimEnd('\'); $s.Description='Deploy Firebase — chon app'; $s.Save(); Write-Host ('Da tao: ' + $lnk)"

echo.
echo Lan sau: double-click "Deploy App" tren Desktop.
pause
