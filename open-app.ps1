# Opens the Jobpls UI. The backend agent runs in the background 24/7; the web UI is
# only needed when you want to review/assess/tailor/apply, so it's started on demand
# here (keeps idle power low). Double-click this or run:
#     powershell -ExecutionPolicy Bypass -File .\open-app.ps1

$root = $PSScriptRoot

# Start the backend if it isn't up (e.g. you haven't installed the agent task yet).
if (-not (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath 'powershell.exe' `
      -ArgumentList "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $root 'agent.ps1')`"" `
      -WindowStyle Hidden
    Start-Sleep -Seconds 3
}

# Start the Vite dev server if it isn't already serving the UI.
if (-not (Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue)) {
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev' `
      -WorkingDirectory (Join-Path $root 'frontend') -WindowStyle Hidden
    Start-Sleep -Seconds 4
}

Start-Process 'http://localhost:5173'
Write-Host "Opening http://localhost:5173 — backend agent on :8000."
