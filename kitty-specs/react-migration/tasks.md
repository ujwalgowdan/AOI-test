# Tasks — React Migration

Lanes follow the spec-kitty convention: `planned` → `in_progress` → `for_review` → `done`.

## planned

(empty at end-of-migration)

## in_progress

(none — tracked in `~/.claude` task list during the active build)

## for_review

(none yet)

## done

- **T1 — Scaffold backend skeleton.** Create `backend/app/main.py` with FastAPI + CORS + `/healthz`. Files: `backend/app/main.py`, `backend/requirements.txt`, `backend/pyproject.toml`.
- **T2 — Copy legacy modules.** Copy `config.py`, `employee_manager.py`, `inspector_manager.py`, `daily_count_manager.py`, `pdf_generator.py`, `email_sender.py` into `backend/legacy/` unchanged. Write `backend/app/adapters/legacy.py`.
- **T3 — Extract `detector_core.py`.** Lift `detect_colors_in_roi`, `evaluate_captured_frame`, `COLOR_RANGES`, `EXPECTED_ORDER` out of `aoi_system_updated/detector.py`. Drop everything else. Add `backend/tests/test_detector_core.py` with assertions against the `OK_*.jpg` / `NOT OK_*.jpg` reference frames.
- **T4 — Employees + Inspectors routers.** `backend/app/routers/employees.py`, `inspectors.py`. CRUD over the legacy managers, admin gate on mutations.
- **T5 — Sessions router + `SessionManager`.** `backend/app/routers/sessions.py`, `backend/app/services/session_manager.py`. Tracks active sessions in memory; on stop, loops counts into `DailyCountManager.add_test_result` and appends Excel row.
- **T6 — Analyze endpoint + WS broadcast.** `backend/app/routers/analyze.py`, `backend/app/routers/ws.py`. Multipart frame → `detector_core.evaluate_frame` → response + WS push.
- **T7 — Reports + daily endpoints.** `backend/app/routers/reports.py`, `daily.py`. Reuse `pdf_generator` + `email_sender`.
- **T8 — Scheduler.** `backend/app/services/scheduler.py` with APScheduler `BackgroundScheduler`; started in FastAPI lifespan.
- **T9 — Frontend scaffold.** `frontend/package.json`, `vite.config.ts`, `tailwind.config.ts`, `tsconfig.json`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, router, TanStack Query provider, Zustand store skeleton, shadcn primitives (button, card, input, select, table, dialog, toast).
- **T10 — Camera hook + components.** `src/hooks/useCamera.ts`, `src/components/CameraView.tsx`, `src/components/CaptureControls.tsx` (button + Space hotkey).
- **T11 — Dashboard page.** `src/routes/Dashboard.tsx` with operator/inspector pickers, camera, counts, daily summary, history.
- **T12 — Settings page.** `src/routes/Settings.tsx` with admin gate, employees CRUD, inspectors CRUD.
- **T13 — Reports page.** `src/routes/Reports.tsx` with download + send-now.
- **T14 — WebSocket subscription.** `src/hooks/useSessionSocket.ts` connecting to `/ws/session/{id}`.
- **T15 — Docker + compose.** `backend/Dockerfile`, `frontend/Dockerfile`, `frontend/nginx.conf`, `docker-compose.yml` (profiles: dev, prod), root `README.md`.
- **T16 — Smoke test.** Start backend locally; verify `/healthz`, OpenAPI page, employees listing.
- **T17 — Legacy archive.** (deferred until parity sign-off)

> Task IDs in this file mirror the implementation order. As tasks complete, move them from `planned` → `done` here; the `~/.claude` task list is the live working copy.
