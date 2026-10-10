@echo off
setlocal
cd /d "%~dp0"
title Shop Studio - Scanner Launcher
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-RestMethod -Uri 'http://127.0.0.1:17899/health' -TimeoutSec 3; if($r.ok){exit 0} } catch {}; exit 1"
if errorlevel 1 (
  echo Starting Windows Scanner Bridge...
  start "Shop Studio Scanner Bridge" "%~dp0START-BRIDGE.cmd"
)
echo Waiting for scanner bridge...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 20;$i++){try{$r=Invoke-RestMethod -Uri 'http://127.0.0.1:17899/health' -TimeoutSec 3;if($r.ok){$ok=$true;break}}catch{};Start-Sleep -Seconds 1};if(-not $ok){exit 1}"
if errorlevel 1 (
  echo ERROR: Scanner Bridge did not start. Check the other console window.
  pause
  exit /b 1
)
start "" "http://127.0.0.1:17899/app/#scanner"
exit /b 0
