# Implementation Plan — React Migration

The full architectural plan lives at `C:\Users\Admin\.claude\plans\run-the-code-in-wobbly-sparrow.md`. This file is the spec-kitty-conformant projection.

## Architecture decisions (ADR-style, brief)

- **ADR-1: Browser-side camera.** React calls `getUserMedia` and POSTs JPEG frames to the backend. Rationale: Docker camera passthrough on Windows is unreliable; this decouples deployment from the camera-attached host and works on any browser.
- **ADR-2: Reuse legacy business modules verbatim.** `EmployeeManager`, `InspectorManager`, `DailyCountManager`, `pdf_generator`, `email_sender`, `config` are copied into `backend/legacy/` and re-exported via an adapter. No edits to their public surface — the v2.1 invariants stay intact.
- **ADR-3: Extract only the pure-function detector logic.** `detect_colors_in_roi` + `evaluate_captured_frame` become `detector_core.py` (no cv2 window, no threads, no daily_count.txt). The browser drives the camera and the trigger.
- **ADR-4: REST for CRUD, WebSocket for live state.** A `/ws/session/{id}` channel pushes counts so all open dashboards stay in sync without polling.
- **ADR-5: APScheduler replaces wall-clock polling.** The 20:00 daily report runs as a `BackgroundScheduler` job started in FastAPI lifespan; no browser dependency.
- **ADR-6: Bind-mount `./data` into the backend.** State files (JSON, XLSX, captured frames, PDFs) stay on the host so they survive container restarts and remain inspectable.
- **ADR-7: Vite + Tailwind + shadcn/ui.** Fast iteration; small bundle; primitives we own. Plus TanStack Query (server state) and Zustand (client state).
- **ADR-8: Admin gate = bearer header with `ADMIN_PASSWORD`.** No new auth system; matches the existing trust model.

## Sequencing (matches `tasks.md`)

1. Scaffold backend skeleton + healthz.
2. Copy legacy modules; write adapters.
3. Extract `detector_core.py` + parity test against reference images.
4. Routers: employees, inspectors.
5. Sessions router + in-memory `SessionManager`.
6. Analyze endpoint + WebSocket broadcast.
7. Reports + daily endpoints.
8. APScheduler wiring.
9. Frontend scaffold (Vite + Tailwind + shadcn + router + TanStack Query + Zustand).
10. `useCamera`, `CameraView`, `CaptureControls`.
11. Dashboard page.
12. Settings page (admin gate).
13. Reports page.
14. WebSocket subscription.
15. Dockerfiles + docker-compose.
16. End-to-end smoke test in a real browser.
17. README polish + archive legacy.

## Risks

- **Color drift between OpenCV BGR raw frames and JPEG-decoded frames** — mitigated by the parity test on reference JPEGs; re-tune `COLOR_RANGES` only if the test regresses (`calibrate_colors.py`).
- **`getUserMedia` over plain HTTP** is blocked outside `localhost`; production deployment needs TLS termination (nginx + self-signed cert documented in README).
- **Single-operator concurrency** is implicit today; explicit `threading.Lock` in adapters protects `DailyCountManager.add_test_result` and the XLSX append.
- **Worktree expectation in spec-kitty CLI** — we chose the in-repo artifact path; CLI use is deferred behind `git init`.
