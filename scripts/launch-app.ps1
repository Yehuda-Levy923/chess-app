# Opens Game review in its own Chrome window, starting the dev server first if
# nothing answers on its port. The port is fixed at 5174 because the browser
# keeps the username, appearance settings and cached reviews per origin; a
# different port would open on an empty app.
#
# The Desktop shortcut runs this hidden:
#   powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File scripts\launch-app.ps1

$ErrorActionPreference = 'Stop'
$port = 5174
$url = "http://localhost:$port/"
$root = Split-Path $PSScriptRoot -Parent
$log = Join-Path $env:TEMP 'chess-app-server.log'

function Test-Up {
  try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 $url).StatusCode -eq 200 } catch { $false }
}

function Show-Error([string]$text) {
  Add-Type -AssemblyName PresentationFramework
  [System.Windows.MessageBox]::Show($text, 'Game review') | Out-Null
}

if (-not (Test-Up)) {
  # Hidden, and left running after the window closes so the next launch is instant.
  Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', "npm run dev -- --port $port --strictPort > `"$log`" 2>&1" -WorkingDirectory $root -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(90)
  while (-not (Test-Up)) {
    if ((Get-Date) -gt $deadline) {
      Show-Error "The app's server didn't start within 90 seconds.`n`nIts log is at $log"
      exit 1
    }
    Start-Sleep -Milliseconds 500
  }
}

$chrome = $null
foreach ($key in 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe', 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe') {
  $p = (Get-ItemProperty $key -ErrorAction SilentlyContinue).'(default)'
  if ($p -and (Test-Path $p)) { $chrome = $p; break }
}

if ($chrome) {
  Start-Process -FilePath $chrome -ArgumentList "--app=$url"
} else {
  # No Chrome: fall back to the default browser.
  Start-Process $url
}
