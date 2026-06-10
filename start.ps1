# Jobpls — start backend + frontend
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "=== Jobpls ===" -ForegroundColor Cyan

# Backend
Write-Host "Starting backend..." -ForegroundColor Yellow
$backend = Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "cd '$root\backend'; python -m uvicorn main:app --reload --port 8000" -PassThru

# Frontend — install deps if needed
if (-not (Test-Path "$root\frontend\node_modules")) {
  Write-Host "Installing frontend dependencies (first run)..." -ForegroundColor Yellow
  Push-Location "$root\frontend"
  npm install
  Pop-Location
}

Write-Host "Starting frontend..." -ForegroundColor Yellow
$frontend = Start-Process powershell -ArgumentList "-NoExit", "-Command",
  "cd '$root\frontend'; npm run dev" -PassThru

Write-Host ""
Write-Host "Backend:  http://localhost:8000" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "API docs: http://localhost:8000/docs" -ForegroundColor Green
Write-Host ""
Write-Host "Press Ctrl+C or close the terminal windows to stop." -ForegroundColor Gray

Wait-Process -Id $backend.Id, $frontend.Id
