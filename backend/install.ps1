# Install backend Python dependencies
$ErrorActionPreference = "Stop"
$dir = $PSScriptRoot

Write-Host "Installing Python deps for Jobpls backend..." -ForegroundColor Cyan
Push-Location $dir
pip install -r requirements.txt
Pop-Location
Write-Host "Done." -ForegroundColor Green
