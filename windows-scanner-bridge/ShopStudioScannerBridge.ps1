param(
  [int]$Port = 17899
)

$ErrorActionPreference = "Stop"
$prefix = "http://127.0.0.1:$Port/"
$napsCandidates = @(
  "C:\Program Files\NAPS2\NAPS2.Console.exe",
  "C:\Program Files (x86)\NAPS2\NAPS2.Console.exe",
  "$env:LOCALAPPDATA\NAPS2\NAPS2.Console.exe"
)
$naps = $napsCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

function Add-Cors($response) {
  $response.Headers["Access-Control-Allow-Origin"] = "*"
  $response.Headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
  $response.Headers["Access-Control-Allow-Headers"] = "Content-Type"
  $response.Headers["Cache-Control"] = "no-store"
}

function Write-Json($ctx, $obj, [int]$status=200) {
  $json = $obj | ConvertTo-Json -Depth 6
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  $ctx.Response.StatusCode = $status
  $ctx.Response.ContentType = "application/json; charset=utf-8"
  Add-Cors $ctx.Response
  $ctx.Response.ContentLength64 = $bytes.Length
  $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
  $ctx.Response.OutputStream.Close()
}

function Get-WiaDevices {
  $result = @()
  try {
    $dm = New-Object -ComObject WIA.DeviceManager
    foreach ($d in $dm.DeviceInfos) {
      if ([int]$d.Type -eq 1) {
        $name = ""
        try { $name = $d.Properties.Item("Name").Value } catch { $name = $d.DeviceID }
        $result += [pscustomobject]@{ driver="wia"; name="$name"; id="$($d.DeviceID)" }
      }
    }
  } catch {}
  return $result
}

function Get-NapsDevices([string]$driver) {
  $result = @()
  if (-not $script:naps) { return $result }
  try {
    $lines = & $script:naps --listdevices --driver $driver 2>$null
    foreach ($line in $lines) {
      $s = "$line".Trim()
      if ($s -and
          $s -notmatch "^(NAPS2|Driver|Devices|Scanning|Version|Copyright)" -and
          $s -notmatch "^-+$") {
        $result += [pscustomobject]@{ driver=$driver; name=$s; id=$s }
      }
    }
  } catch {}
  return $result
}

function Get-AllDevices {
  $all = @()
  if ($script:naps) {
    $all += Get-NapsDevices "wia"
    $all += Get-NapsDevices "twain"
  }
  # Always enumerate native Windows WIA, including when NAPS2 is installed.
  $all += Get-WiaDevices
  # de-duplicate driver/name pairs
  $seen = @{}
  $out = @()
  foreach ($d in $all) {
    $k = "$($d.driver)|$($d.name)"
    if (-not $seen.ContainsKey($k)) { $seen[$k]=$true; $out += $d }
  }
  return $out
}

function Scan-WithNaps($device,$driver,$dpi,$bitdepth,$source,$deskew) {
  if (-not $script:naps) { throw "NAPS2 is not installed." }
  $tmp = Join-Path $env:TEMP ("shopstudio-scan-" + [guid]::NewGuid().ToString("N") + ".jpg")
  $args = @(
    "-o", $tmp, "--force",
    "--noprofile",
    "--driver", $driver,
    "--device", $device,
    "--dpi", "$dpi",
    "--bitdepth", $bitdepth,
    "--source", $source,
    "-n", "1"
  )
  if ($deskew -eq "true") { $args += "--deskew" }
  & $script:naps @args
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $tmp)) {
    throw "Scanner command failed. Check scanner power, driver, paper source, and device name."
  }
  return $tmp
}

function Scan-WithWiaFallback {
  $dialog = New-Object -ComObject WIA.CommonDialog
  # DeviceType 1=scanner, Intent 1=color, Bias 131072=max quality
  $image = $dialog.ShowAcquireImage(1,1,131072,"{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}",$true,$true,$false)
  if (-not $image) { throw "Scan cancelled." }
  $tmp = Join-Path $env:TEMP ("shopstudio-scan-" + [guid]::NewGuid().ToString("N") + ".jpg")
  $image.SaveFile($tmp)
  return $tmp
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host ""
Write-Host "Shop Studio Scanner Bridge" -ForegroundColor Yellow
Write-Host "Listening on $prefix"
if ($naps) {
  Write-Host "NAPS2: $naps" -ForegroundColor Green
  Write-Host "WIA + TWAIN enabled through NAPS2." -ForegroundColor Green
} else {
  Write-Host "NAPS2 not found. WIA fallback mode only." -ForegroundColor DarkYellow
}
Write-Host "Keep this window running, or install the startup task."
Write-Host ""

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      Add-Cors $ctx.Response
      if ($ctx.Request.HttpMethod -eq "OPTIONS") {
        $ctx.Response.StatusCode = 204
        $ctx.Response.Close()
        continue
      }

      $path = $ctx.Request.Url.AbsolutePath.ToLowerInvariant()

      if ($path -eq "/health") {
        Write-Json $ctx @{
          ok=$true
          service="Shop Studio Scanner Bridge"
          version="1.0"
          naps2=([bool]$naps)
          wia=$true
          twain=([bool]$naps)
        }
        continue
      }

      if ($path -eq "/scanners") {
        Write-Json $ctx @{
          scanners=@(Get-AllDevices)
          naps2=([bool]$naps)
        }
        continue
      }

      if ($path -eq "/scan") {
        $q = $ctx.Request.QueryString
        $device = [Uri]::UnescapeDataString("$($q["device"])")
        $driver = "$($q["driver"])".ToLowerInvariant()
        if ($driver -notin @("wia","twain")) { $driver="wia" }
        $dpi = 300
        if ($q["dpi"] -match "^\d+$") { $dpi=[int]$q["dpi"] }
        $dpi = [Math]::Max(75,[Math]::Min(1200,$dpi))
        $bitdepth = "$($q["bitdepth"])".ToLowerInvariant()
        if ($bitdepth -notin @("color","gray","bw")) { $bitdepth="color" }
        $source = "$($q["source"])".ToLowerInvariant()
        if ($source -notin @("glass","feeder","duplex")) { $source="glass" }
        $deskew = "$($q["deskew"])".ToLowerInvariant()

        if ($naps -and $device) {
          try { $tmp = Scan-WithNaps $device $driver $dpi $bitdepth $source $deskew }
          catch {
            if ($driver -eq 'wia') { $tmp = Scan-WithWiaFallback }
            else { throw }
          }
        } else {
          $tmp = Scan-WithWiaFallback
        }

        $bytes = [IO.File]::ReadAllBytes($tmp)
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
        $ctx.Response.StatusCode = 200
        $ctx.Response.ContentType = "image/jpeg"
        $ctx.Response.Headers["X-Scanner-Driver"] = $driver
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes,0,$bytes.Length)
        $ctx.Response.OutputStream.Close()
        continue
      }

      Write-Json $ctx @{error="Not found"} 404
    }
    catch {
      try { Write-Json $ctx @{error=$_.Exception.Message} 500 } catch {}
    }
  }
}
finally {
  $listener.Stop()
  $listener.Close()
}
