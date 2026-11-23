#!/usr/bin/env bash
# One-command launcher for the AOI dev stack.
# Starts the FastAPI backend (uvicorn :8000) and the Vite dev server (:5173),
# prints their PIDs and URLs, and tears both down on Ctrl+C.
#
# Usage:
#   ./scripts/run-dev.sh              # full prereq + install + launch
#   ./scripts/run-dev.sh --no-install # skip pip/npm install even if missing

set -euo pipefail

NO_INSTALL=0
for arg in "$@"; do
    case "$arg" in
        --no-install) NO_INSTALL=1 ;;
        -h|--help)
            sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
            exit 0 ;;
        *) echo "Unknown arg: $arg" >&2; exit 2 ;;
    esac
done

repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo"

echo "AOI dev launcher"
echo "Repo: $repo"

# ---------- .env check ----------
if [[ ! -f "$repo/.env" ]]; then
    echo "WARNING: no .env at $repo. Backend will use insecure defaults. Copy .env.example -> .env and edit before any non-local use." >&2
fi

# ---------- tool availability ----------
for cmd in python npm; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "ERROR: $cmd not on PATH. Install Python 3.12 and Node 22 (or compatible)." >&2
        exit 1
    fi
done

# ---------- dep checks ----------
if [[ $NO_INSTALL -eq 0 ]]; then
    echo "Checking backend Python deps..."
    if ! python -c "import fastapi, uvicorn, apscheduler, cv2" >/dev/null 2>&1; then
        echo "Backend deps missing — running 'pip install -r backend/requirements.txt'..."
        pip install -r "$repo/backend/requirements.txt"
    fi

    if [[ ! -d "$repo/frontend/node_modules" ]]; then
        echo "Frontend node_modules missing — running 'npm install' in frontend/..."
        ( cd "$repo/frontend" && npm install )
    fi
fi

# ---------- launch ----------
echo
echo "Starting backend (uvicorn) on http://127.0.0.1:8000 ..."
( cd "$repo/backend" && exec python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 \
    --reload --reload-dir app --reload-dir legacy ) &
backend_pid=$!

echo "Starting frontend (vite) on http://localhost:5173 ..."
( cd "$repo/frontend" && exec npm run dev ) &
frontend_pid=$!

cleanup() {
    echo
    echo "Stopping services..."
    kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
    wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
    echo "Both services stopped."
}
trap cleanup EXIT INT TERM

echo
echo "------------------------------------------------------------"
echo " Backend  PID $backend_pid -> http://127.0.0.1:8000"
echo " Frontend PID $frontend_pid -> http://localhost:5173"
echo
echo " Press Ctrl+C to stop both."
echo "------------------------------------------------------------"
echo

wait
