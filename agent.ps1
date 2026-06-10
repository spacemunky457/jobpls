# Jobpls alert agent — runs the backend (which hosts the scheduler: discovery every
# 6h, digest email every 12h, with catch-up after sleep/boot). Keep this running and
# the agent works whenever your laptop is on. Uvicorn runs in the FOREGROUND here so
# the Scheduled Task can restart it if it ever exits.
#
# DB and .env use absolute paths, so the working directory never affects which
# database is used (this previously caused a two-database split).

Set-Location (Join-Path $PSScriptRoot 'backend')
python -m uvicorn main:app --port 8000
