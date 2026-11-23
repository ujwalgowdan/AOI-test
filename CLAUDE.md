# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

One-shot dev launcher (backend on :8000, frontend on :5173, both torn down on Ctrl+C):

```powershell
.\scripts\run-dev.ps1            # add -NoInstall to skip dep checks
```

```bash
./scripts/run-dev.sh             # add --no-install in CI
```

Manual two-terminal launch:

```powershell
cd backend  ; pip install -r requirements.txt ; uvicorn app.main:app --reload --port 8000
cd frontend ; npm install ; npm run dev
```

Quality gates:

```powershell
cd frontend ; npm run lint ; npm run typecheck ; npm run test ; npm run build
cd backend  ; python -m pytest
```

Targeted tests:

```powershell
cd backend  ; python -m pytest tests/test_detector_core.py -k <name>
cd frontend ; npx vitest run src/lib/schemas.test.ts
cd frontend ; npm run test:e2e -- --grep "dashboard"   # Playwright (boots Vite via webServer)
```

Frontend formatter/auto-fix is Biome: `npm run lint:fix` / `npm run format`.

## Architecture

### Two-process system, Postgres + a shared file dir for images

Backend (`backend/app/`, FastAPI 3.0.0) and frontend (`frontend/`, Vite + React 18 + TS) communicate over REST + a per-session WebSocket. In dev, Vite proxies `/api`, `/ws`, `/healthz` to `http://localhost:8000` (see `frontend/vite.config.ts`); the frontend client (`src/api/client.ts`) therefore uses `BASE = ""` and assumes same-origin everywhere.

Operational state — operators, inspectors, sessions, per-cable test results — lives in **Postgres**. The schema is defined by SQLAlchemy ORM models in `backend/app/db/models.py` (`operators`, `inspectors`, `sessions`, `captures`). Image bytes still sit on disk under `AOI_DATA_DIR/detection_results/<label>_<stamp>.jpg`; `captures.image_path` stores just the filename so `/api/captures/{name}` keeps serving them by name.

`DATABASE_URL` is required (no flat-file fallback). The fastest way to bring everything up is `docker compose up --build` from the repo root — that boots Postgres 16, the FastAPI backend, and the Vite frontend, all wired together. For non-Docker dev, point `DATABASE_URL` at an existing Postgres (see `.env.example`).

On every boot, `app.db.init.init_db()` runs from the FastAPI lifespan — it creates any missing tables and then runs a one-shot, idempotent migration that imports legacy `employees.json` / `inspectors.json` / `daily_test_log.json` if they exist. The JSON files stay on disk afterwards but the app no longer reads them.

### The adapter seam — read this before touching backend code

The Streamlit-era business logic (`email_sender`, `pdf_generator`, `config`) still lives in `backend/legacy/` unchanged. The data managers (`employee_manager`, `inspector_manager`, `daily_count_manager`) were replaced by DB-backed facades but **the public API is preserved**: routers still call `legacy.employees.add_employee(...)`, `legacy.daily_counts.get_daily_summary()`, etc. — those names now resolve to SQLAlchemy-backed adapter classes in `backend/app/adapters/legacy.py`.

1. `backend/app/_bootstrap.py` runs at import time, `chdir`s into `AOI_DATA_DIR`, and inserts `backend/legacy/` into `sys.path` so `legacy/config.py`, `legacy/pdf_generator.py`, and `legacy/email_sender.py` import bare.
2. `backend/app/adapters/legacy.py` is the only module that imports from `legacy/`. Routers import via this adapter — never reach into `legacy/` directly. The adapter exposes DB-backed `employees` / `inspectors` / `daily_counts` instances and re-exports `generate_report_pdf`, `send_daily_report`, `config`, and the process-wide `write_lock` (still used by the PDF/email path that touches disk).
3. New DB writes happen at the router layer via `app.db.engine.SessionLocal`. Each `POST /api/sessions/{sid}/analyze` inserts a `captures` row in-band so per-cable history is the source of truth; `/api/reports/history` aggregates from `captures` joined to `sessions`.

`app._bootstrap` must be imported **before** any `legacy.*` import. `app/main.py` enforces this with explicit `noqa` imports at the top.

### Backend layout

- `app/main.py` — FastAPI app, CORS, lifespan that starts/stops APScheduler.
- `app/routers/` — one router per resource: `employees`, `inspectors`, `sessions`, `analyze`, `captures`, `daily`, `reports`, `ws`.
- `app/services/detector_core.py` — pure-function OpenCV detection lifted out of `legacy/detector.py`. **Orientation is picked per-frame from centroid spread**: horizontal layouts sort by x-centroid (image-left = operator-left); vertical layouts sort by y-centroid ascending (image-top = operator-left in the current mount, which was rotated 180° from the 2026-05-20 mount). If hardware flips again, change only the sign of the vertical lambda in `detect_colors_in_roi` and update the matching tests in `test_detector_evaluate.py`. `NOT DETECTED` is returned when fewer than both expected colours are present in the ROI; mismatched-but-both-detected is `NOT OK` so the operator gets an actionable result. A near-overlap guard (`MIN_CENTROID_SEPARATION_PX`) flags stacked centroids as `NOT OK` rather than letting sub-pixel noise pick the order.
- `app/services/session_manager.py` — in-memory `SessionManager` keyed by uuid, with per-session `asyncio.Queue` subscribers for WebSocket fanout (slow subscribers are dropped, not blocked). The active-session map is the live source of truth; XLSX/JSON files are written at session-stop time only.
- `app/services/scheduler.py` — replaces the legacy Streamlit wall-clock polling with an APScheduler `BackgroundScheduler` cron job. Runs only if `config.AUTO_SEND_DAILY_REPORT` is true.
- `app/deps.py` — `require_admin` Bearer-token dependency. The token value is `config.ADMIN_PASSWORD` (from `.env`). All mutation routes on `employees`, `inspectors`, and the manual "send daily report" endpoint are gated by this.
- `app/schemas.py` — Pydantic v2 request/response models.

### Capture/analyze flow

`POST /api/sessions/{sid}/analyze` (multipart JPEG) → `detector_core.evaluate_frame` → annotated JPEG written to `detection_results/<label>_<stamp>.jpg` (legacy naming + overlays preserved) → **INSERT into `captures`** with operator/inspector FKs, result, detected/expected colour order, captured_at timestamp, and image filename → `SessionManager.record_capture` bumps in-memory counts → broadcast `{type: "counts", ...}` to WebSocket subscribers → return result.

When a session is stopped (`POST /api/sessions/{sid}/stop`), `sessions.py` just stamps `ended_at` on the corresponding `sessions` row. The per-cable rows are already in `captures` (inserted by `/analyze`), so daily summaries and reports query straight from there — there is no fan-out loop and no XLSX writeback.

### Frontend layout

React 18 + TS, Vite, TailwindCSS, Radix UI primitives in `components/ui/`, React Router, React Query, Zustand, react-hook-form + Zod, Sonner toasts.

- Routes: `/` Dashboard, `/reports`, `/settings` (`src/routes/`). Top-level `App.tsx` wires the nav + `ErrorBoundary` + `Toaster`.
- `src/api/client.ts` is the only place that calls `fetch`. Every response is parsed through a Zod schema from `src/lib/schemas.ts` — that's the runtime boundary between backend JSON and TS types. Add a new endpoint by extending both files together.
- `src/store/session.ts` (Zustand) holds the active session, dropdown selections, and the admin Bearer token (persisted to `localStorage` under `aoi.adminToken`).
- `src/hooks/useCamera.ts` enumerates `getUserMedia` devices, picks a real webcam over OBS/virtual cams by label heuristics, and exposes `grabFrame()` which the Dashboard posts to `/analyze`.
- `src/hooks/useSessionSocket.ts` opens `/ws/session/{id}`, sends `ping` for liveness, and pushes `counts` payloads into the Zustand store.
- Path alias: `@/*` → `src/*` (configured in both `vite.config.ts` and `tsconfig.json`).
- E2E (`frontend/e2e/`) runs serially (`workers: 1`, `fullyParallel: false`) because the backend mutates shared state files.

### Configuration

`.env` (copy from `.env.example`) is loaded by `backend/legacy/config.py` via `python-dotenv`. The `validate_config()` function prints warnings on every backend boot if `ADMIN_PASSWORD`, `SENDER_EMAIL/PASSWORD`, or `RECIPIENT_EMAILS` are still placeholders. Detection HSV ranges live only in `detector_core.COLOR_RANGES` (the unused copy in `legacy/config.py` was removed). The root-level `detector.py` keeps its own, different values and is not used by the backend. If recalibrating with `archive/legacy-streamlit/calibrate_colors.py`, update `detector_core.COLOR_RANGES`.

### What's in `archive/` and `aoi_system_updated/`

`archive/legacy-streamlit/` is the frozen v2.1 Streamlit app — historical reference only, **nothing in `backend/` or `frontend/` imports from it**. Keep it around for re-running `calibrate_colors.py`. The empty `aoi_system_updated/` directory is a cosmetic artifact of the move (see README §Residual cleanup); no production code references it.

### Spec-kitty missions

Non-trivial work is tracked under `kitty-specs/<slug>/` with four files: `charter.md`, `spec.md`, `plan.md`, `tasks.md`. Current in-progress mission: `frontend-upgrade`.
