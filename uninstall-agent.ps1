# Removes the Jobpls alert agent scheduled task (stops it auto-starting at login).
#     powershell -ExecutionPolicy Bypass -File .\uninstall-agent.ps1
try {
    Stop-ScheduledTask -TaskName 'JobplsAgent' -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName 'JobplsAgent' -Confirm:$false
    Write-Host "Removed scheduled task 'JobplsAgent'."
} catch {
    Write-Host "Task 'JobplsAgent' not found (nothing to remove)."
}
