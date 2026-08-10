@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Tao shortcut Desktop

echo.
echo  Tao shortcut Deploy tren Desktop...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; ^
   $root = (Resolve-Path '%~dp0').Path; ^
   $auto = Join-Path $root 'Deploy-TuDong.bat'; ^
   $menu = Join-Path $root 'Chay-Deploy.bat'; ^
   if (-not (Test-Path -LiteralPath $auto)) { throw 'Khong tim thay Deploy-TuDong.bat' }; ^
   $desktop = [Environment]::GetFolderPath('Desktop'); ^
   $w = New-Object -ComObject WScript.Shell; ^
   $items = @( ^
     @{ Name='Deploy Tu Dong.lnk'; Target=$auto; Desc='1 cham: commit + pull + push + Firebase' }, ^
     @{ Name='Deploy App.lnk'; Target=$(if (Test-Path -LiteralPath $menu) { $menu } else { $auto }); Desc='Menu chon app / deploy' } ^
   ); ^
   foreach ($it in $items) { ^
     $lnkPath = Join-Path $desktop $it.Name; ^
     $s = $w.CreateShortcut($lnkPath); ^
     $s.TargetPath = $it.Target; ^
     $s.WorkingDirectory = $root; ^
     $s.WindowStyle = 1; ^
     $s.Description = $it.Desc; ^
     $s.Save(); ^
     Write-Host ('Da tao: ' + $lnkPath) -ForegroundColor Green; ^
   }; ^
   Write-Host ''; ^
   Write-Host 'Xong. Double-click \"Deploy Tu Dong\" tren Desktop.' -ForegroundColor Cyan"

echo.
pause
