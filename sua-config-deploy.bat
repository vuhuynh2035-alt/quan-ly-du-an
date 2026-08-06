@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo Sua / tao lai config deploy bi hong...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$root='%~dp0'; $local=Join-Path $root 'scripts\deploy-apps.local.json'; $ex=Join-Path $root 'scripts\deploy-apps.local.example.json'; if (Test-Path $local) { $bak=$local+'.broken-'+ (Get-Date -Format 'yyyyMMdd-HHmmss') +'.bak'; Copy-Item $local $bak -Force; Write-Host ('Backup: '+$bak) -ForegroundColor Yellow }; Copy-Item $ex $local -Force; Write-Host ('Da ghi: '+$local) -ForegroundColor Green; Write-Host 'Giu account mapping Xuan Quynh / yana / quan ly xe.' -ForegroundColor Cyan"

echo.
echo Xong. Chay deploy.bat de mo menu.
pause
