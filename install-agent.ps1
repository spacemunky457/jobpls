# Registers the Jobpls alert agent as a Windows Scheduled Task that starts at login,
# runs hidden, survives on battery, and restarts itself if it stops. Run once:
#     powershell -ExecutionPolicy Bypass -File .\install-agent.ps1
# (If you get an access-denied error, run the same line in an *Administrator* PowerShell.)

$ErrorActionPreference = 'Stop'
$root  = $PSScriptRoot
$agent = Join-Path $root 'agent.ps1'
$taskName = 'JobplsAgent'

$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
  -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$agent`""

$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

# Laptop-friendly: run on battery, don't stop when unplugging, no time limit,
# and auto-restart if the backend ever exits.
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999 `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger `
  -Settings $settings -Description 'Jobpls job-alert agent (backend scheduler)' -Force | Out-Null

Write-Host "Installed scheduled task '$taskName' (runs at login)."
Write-Host "Starting it now so you don't have to log out..."
Start-ScheduledTask -TaskName $taskName
Start-Sleep -Seconds 4
$conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($conn) { Write-Host "Agent is running on http://localhost:8000" -ForegroundColor Green }
else { Write-Host "Agent task created but backend not detected on :8000 yet — check Task Scheduler / that 'python' is on PATH." -ForegroundColor Yellow }
