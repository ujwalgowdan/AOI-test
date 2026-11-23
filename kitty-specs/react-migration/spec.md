# Specification — React Frontend for AOI

## User stories

**S1.** As an operator, I open `http://<station>:5173` (dev) or `:8080` (prod) and see a Dashboard with operator + inspector pickers, a live camera preview, a Capture button, and OK / NOT OK counts.

**S2.** As an operator, I select my name and the first-piece inspector, click START, position a wire, press **Space** or click **Capture**, and within ~500 ms see the result (OK / NOT OK / NOT DETECTED) and an updated count.

**S3.** As an operator, I click STOP and the session is finalized: an Excel row is appended and one `daily_test_log` entry per cable is written.

**S4.** As an operator, I see today's running totals (total, pass, fail, cumulative pass rate) on the Dashboard, even across sessions.

**S5.** As an admin, after entering the admin password, I can add / remove / edit operators and inspectors under Settings.

**S6.** As a supervisor, I receive the daily PDF report at 20:00 with the legacy layout; I can also trigger it on demand from the Reports page.

**S7.** As a maintainer, I bring up the whole stack with one command: `docker compose --profile dev up --build`.

## Screen-by-screen UX

### Dashboard (`/`)
- Top bar: company logo + machine name + admin gear icon (→ Settings).
- Left column: Operator picker (Select), Inspector picker (Select), START / STOP buttons.
- Center: `CameraView` — `<video>` showing the `getUserMedia` stream, with a thin overlay frame indicating ROI. Below: `Capture` button (disabled until session started); a `Last result` card showing the last captured image and result with a colored badge.
- Right column: live `OK` / `NOT OK` count cards (from WebSocket), Daily Summary (total / pass / fail / pass rate), History table (last 10 sessions).

### Settings (`/settings`)
- Admin password prompt (stored in `localStorage`, sent as `Authorization: Bearer <pw>` header).
- Employees table with add / edit / remove.
- Inspectors table with add / edit / remove.
- "Send test email" button.

### Reports (`/reports`)
- Today's summary.
- Download Daily PDF (browser download).
- Send Daily Report Now (admin-gated; calls `/api/reports/daily/send`).

## API contract (summary)

| Method | Path | Purpose | Admin? |
|--------|------|---------|--------|
| GET | `/healthz` | liveness | no |
| GET | `/api/employees` | list | no |
| POST | `/api/employees` | add | yes |
| DELETE | `/api/employees/{id}` | remove | yes |
| GET | `/api/inspectors` | list | no |
| POST | `/api/inspectors` | add | yes |
| PUT | `/api/inspectors/{id}` | update | yes |
| DELETE | `/api/inspectors/{id}` | remove | yes |
| POST | `/api/sessions/start` | begin session | no |
| POST | `/api/sessions/{id}/stop` | end session | no |
| GET | `/api/sessions/{id}` | session state | no |
| POST | `/api/sessions/{id}/analyze` | upload one frame | no |
| GET | `/api/daily/summary` | today totals | no |
| GET | `/api/reports/history?limit=10` | recent sessions | no |
| POST | `/api/reports/daily/generate` | PDF bytes | no |
| POST | `/api/reports/daily/send` | email PDF | yes |
| WS | `/ws/session/{id}` | live counts push | no |

All bodies and responses are JSON unless noted. `analyze` is multipart with field `frame` (JPEG). Pydantic schemas live in `backend/app/schemas.py`.

## Acceptance criteria

- [ ] The detector parity test passes: every reference `OK_*.jpg` / `NOT OK_*.jpg` returns the expected label from `detector_core.evaluate_frame()`.
- [ ] After a session with N captures, `detection_results.xlsx` has exactly one new session row and `daily_test_log.json` has exactly N new test entries.
- [ ] PDF generated via the new API is byte-identical (or visually identical) to the legacy PDF given the same input.
- [ ] APScheduler fires the daily-send job at `config.DAILY_REPORT_TIME` without a browser open.
- [ ] The frontend Dashboard loads under 1 s on `localhost`.
- [ ] The legacy `aoi_system_updated/` directory is untouched until sign-off.
