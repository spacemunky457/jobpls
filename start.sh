#!/usr/bin/env bash
# Jobpls — start backend (:8000) + frontend (:5173) on Linux/macOS.
# Mirrors start.ps1. Use python -m uvicorn (not bare uvicorn).
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Jobpls ==="

# First-run frontend deps
if [ ! -d "$ROOT/frontend/node_modules" ]; then
  echo "Installing frontend dependencies (first run)..."
  ( cd "$ROOT/frontend" && npm install )
fi

echo "Starting backend on :8000..."
( cd "$ROOT/backend" && .venv/bin/python -m uvicorn main:app --reload --port 8000 ) &
BACK=$!

echo "Starting frontend on :5173..."
( cd "$ROOT/frontend" && npm run dev ) &
FRONT=$!

echo ""
echo "Backend:  http://localhost:8000  (docs: /docs)"
echo "Frontend: http://localhost:5173"
echo "Ctrl+C to stop both."

trap 'kill "$BACK" "$FRONT" 2>/dev/null' EXIT INT TERM
wait
