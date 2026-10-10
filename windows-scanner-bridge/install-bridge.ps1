$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$bridge = Join-Path $here "ShopStudioScannerBridge.ps1"
$url = "http://127.0.0.1:17899/"

Write-Host "Installing Shop Studio Scanner Bridge..." -ForegroundColor Yellow

# Reserve the localhost URL for the current Windows user.
$user = "$env:USERDOMAIN\$env:USERNAME"
try { netsh http delete urlacl url=$url | Out-Null } catch {}
netsh http add urlacl url=$url user="$user" | Out-Null

# Create a per-user startup scheduled task.
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$bridge`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName "ShopStudioScannerBridge" -Action $action -Trigger $trigger -Principal $principal -Description "Local WIA/TWAIN scanner bridge for Shop Studio Pro" -Force | Out-Null

# Start now.
Start-Process powershell.exe -WindowStyle Hidden -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$bridge`""

Write-Host ""
Write-Host "Bridge installed and started." -ForegroundColor Green
Write-Host "Local endpoint: $url"
Write-Host ""
Write-Host "IMPORTANT:"
Write-Host "For best TWAIN + WIA support, install NAPS2 from https://www.naps2.com/"
Write-Host "The bridge automatically detects C:\Program Files\NAPS2\NAPS2.Console.exe."
Write-Host ""
Write-Host "Test in your browser:"
Write-Host "http://127.0.0.1:17899/health"
