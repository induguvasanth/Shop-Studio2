$ErrorActionPreference = "SilentlyContinue"
Unregister-ScheduledTask -TaskName "ShopStudioScannerBridge" -Confirm:$false
netsh http delete urlacl url=http://127.0.0.1:17899/ | Out-Null
Get-CimInstance Win32_Process | Where-Object {
  $_.Name -match "powershell" -and $_.CommandLine -match "ShopStudioScannerBridge.ps1"
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Write-Host "Shop Studio Scanner Bridge removed."
