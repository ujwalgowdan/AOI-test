# AOI System

Automated Optical Inspection station for wire-connector quality testing on the
Innotech Integration manufacturing line.

## Layout

```
backend/                  ← FastAPI v3.0.0 (REST + WebSocket; APScheduler daily report)
frontend/                 ← Vite + React + TypeScript dashboard
data/                     ← On-host state (JSON, XLSX, captured frames, PDFs)
kitty-specs/              ← spec-kitty missions (charter / spec / plan / tasks)
archive/legacy-streamlit/ ← Frozen v2.1 Streamlit app — read-only reference
```

## Quickstart

One command brings the whole dev stack up:

```powershell
# Windows (PowerShell)
Copy-Item .env.example .env   # then edit ADMIN_PASSWORD and SMTP creds
.\scripts\run-dev.ps1
```

```bash
# Unix
cp .env.example .env          # then edit ADMIN_PASSWORD and SMTP creds
chmod +x scripts/run-dev.sh   # first time only
./scripts/run-dev.sh
```

The launcher:
- warns if `.env` is missing,
- installs backend Python deps if any of `fastapi`/`uvicorn`/`apscheduler`/`cv2` won't import,
- runs `npm install` if `frontend/node_modules` is missing,
- starts the backend on <http://127.0.0.1:8000> and the frontend on <http://localhost:5173>,
- prints both PIDs and waits.

Press **Ctrl+C** in the launcher terminal to stop both services. Pass `-NoInstall`
(PowerShell) or `--no-install` (bash) to skip the dep-install steps in CI.

Open <http://localhost:5173> in a browser on a host with a webcam.

### Manual launch (if you prefer two terminals)

```powershell
# Backend (FastAPI, port 8000)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (Vite, port 5173)
cd frontend
npm install
npm run dev
```

## Quality gates

```powershell
# Frontend
cd frontend
npm run lint && npm run typecheck && npm run test && npm run build

# Backend
cd backend
python -m pytest
```

## Missions

The repo follows the [spec-kitty](https://github.com/Priivacy-ai/spec-kitty)
workflow. Each mission lives under `kitty-specs/<slug>/` with four files —
`charter.md`, `spec.md`, `plan.md`, `tasks.md`.

| Mission | Status | Summary |
|--|--|--|
| `react-migration` | done (predecessor) | Streamlit → React+FastAPI rewrite. |
| `frontend-upgrade` | in progress | Finishes Settings + Reports, adds Biome/Vitest/Playwright/Zod, archives Streamlit. |

## Legacy code

`archive/legacy-streamlit/` is the full v2.1 Streamlit code (operator-facing
OpenCV camera window). It is **not** in the build path; nothing under
`backend/` or `frontend/` imports from it. Keep it around as historical
reference and for re-running `calibrate_colors.py` if `COLOR_RANGES` needs to
be re-tuned for new camera or lighting conditions.

### Residual cleanup

The move from `aoi_system_updated/` to `archive/legacy-streamlit/` leaves an
empty hidden `.git` directory at `aoi_system_updated/` because a tool (e.g. an
open IDE) held a file lock during the move. The data is fully migrated. Once
the locking tool is closed, the residual directory can be removed by the user
with:

```powershell
Remove-Item -Recurse -Force "aoi_system_updated"
```

No production code references `aoi_system_updated/`; this is a cosmetic cleanup
step.
