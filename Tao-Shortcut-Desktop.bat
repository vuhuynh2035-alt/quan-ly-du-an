@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Tao shortcut Desktop

echo.
echo  Tao shortcut "Deploy App" tren Desktop...
echo  (sau do chi can double-click icon tren Desktop)
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; ^
   $root = (Resolve-Path '%~dp0').Path; ^
   $bat = Join-Path $root 'Chay-Deploy.bat'; ^
   if (-not (Test-Path -LiteralPath $bat)) { $bat = Join-Path $root 'deploy.bat' }; ^
   if (-not (Test-Path -LiteralPath $bat)) { throw 'Khong tim thay Chay-Deploy.bat / deploy.bat' }; ^
   $desktop = [Environment]::GetFolderPath('Desktop'); ^
   $names = @('Deploy App.lnk', 'Chay Deploy.lnk'); ^
   $w = New-Object -ComObject WScript.Shell; ^
   foreach ($n in $names) { ^
     $lnkPath = Join-Path $desktop $n; ^
     $s = $w.CreateShortcut($lnkPath); ^
     $s.TargetPath = $bat; ^
     $s.WorkingDirectory = $root; ^
     $s.WindowStyle = 1; ^
     $s.Description = 'Deploy Firebase - chon so app la chay'; ^
     $s.Save(); ^
     Write-Host ('Da tao: ' + $lnkPath) -ForegroundColor Green; ^
   }; ^
   Write-Host ''; ^
   Write-Host 'Xong. Len Desktop double-click \"Deploy App\" hoac \"Chay Deploy\".' -ForegroundColor Cyan"

echo.
pause
