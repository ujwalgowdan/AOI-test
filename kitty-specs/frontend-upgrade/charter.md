# Mission Charter — Frontend Upgrade

**Mission slug:** `frontend-upgrade`
**Owner:** AOI engineering
**Status:** in progress
**Predecessor:** `kitty-specs/react-migration/` (completed scaffold; left two routes unimplemented)

## Why

The React migration mission produced a working Dashboard but stopped short of
parity with the legacy Streamlit feature set:

- `frontend/src/App.tsx` imports `./routes/Settings` and `./routes/Reports`, neither of which exists on disk. Any nav click outside Dashboard crashes the app.
- The frontend has no unit tests, no end-to-end tests, no linter beyond `tsc --noEmit`, no formatter, and no error boundary.
- UI primitives in `frontend/src/components/ui/` are hand-rolled; three Radix UI packages listed in `package.json` are never imported (dead deps).
- API responses are TypeScript-asserted, not runtime-validated — a malformed backend payload silently corrupts the UI.
- The legacy Streamlit code at `aoi_system_updated/` still occupies the repo root and confuses new readers.

This mission finishes the migration without altering backend behavior.

## Success criteria

1. Settings page lets an admin (with bearer token) add / remove / edit employees and inspectors, with toast feedback and react-hook-form validation.
2. Reports page renders today's summary, history table with configurable limit, "Generate PDF" download, and "Send daily report" (admin-gated).
3. `cd frontend && npm run lint && npm run typecheck && npm run test && npm run build && npm run test:e2e` all exit 0.
4. `pytest backend/tests/test_detector_core.py -v` passes against reference frames now living under `backend/tests/fixtures/reference_frames/`.
5. `aoi_system_updated/` has been moved to `archive/legacy-streamlit/` and is no longer referenced by any build, test, or doc.
6. Dashboard is never broken between tasks — the user can demo the camera flow at any point during the mission.

## Non-goals

- React 19, Tailwind v4, or TanStack Router migration (deferred to a later mission).
- New backend endpoints. Existing FastAPI surface is read-only for this mission.
- Replacing JSON / XLSX persistence with a database.
- Authentication beyond the existing `ADMIN_PASSWORD` bearer-token gate.
- Mobile layouts.

## Stakeholders

- Operators on the inspection line (camera flow must keep working throughout).
- QA / supervisors (receive the daily PDF; new Reports UI is for them).
- Maintainers (gain lint + tests; can re-tune `COLOR_RANGES` via `calibrate_colors.py` in the archive).

## Out-of-scope artifacts

Anything beyond the verification checklist in `plan.md` — Sentry, telemetry,
auth providers, multi-tenant — is a follow-up mission.
