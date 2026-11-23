# Specification — Frontend Upgrade

## User stories

**S1.** As an admin, I open `/settings`, am prompted for the admin password (stored as the `ADMIN_PASSWORD` env var on the backend), and on entry can see the employees and inspectors tables.

**S2.** As an admin, I add a new employee via a dialog form with `id` + `name`. A success toast confirms, the table refetches, and the new row appears. Duplicate IDs return a 409 from the backend; the UI surfaces the error message in the dialog.

**S3.** As an admin, I remove an employee with a confirm step. The table refetches; toast confirms.

**S4.** As an admin, I add / remove inspectors the same way as employees, plus I can inline-edit an existing inspector's name or ID via `PUT /api/inspectors/{id}`.

**S5.** As a supervisor, I open `/reports` and see today's summary (total / pass / fail / cumulative pass rate), a history table with a row-limit selector (10 / 50 / 100), and two buttons: "Download daily PDF" (no auth) and "Send daily report now" (admin-gated; disabled when no admin token is set).

**S6.** As any user, when a React component throws, I see a friendly error card instead of a blank screen. The console retains the stack for debugging.

**S7.** As a maintainer, I run `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, `npm run test:e2e`, and `pytest` from a clean clone and all pass.

**S8.** As a maintainer, the legacy Streamlit code lives under `archive/legacy-streamlit/` and nothing in the live tree references it.

## Screen-by-screen UX

### Settings (`/settings`)
- If no admin token in store: a single `Card` with a `Lock` icon, password `Input`, and "Unlock" button. Submitting the form calls `setAdminToken(value)`. There is no backend verification at this point — the token is sent on the first admin-mutating call; failures surface as 401/403 toasts and clear the token.
- After unlock: two stacked sections — Employees and Inspectors.
- Each section: `<Table>` of rows; "Add" button opens a Radix `Dialog` containing a `<Form>` (react-hook-form + `zodResolver(PersonSchema)`) with two `<Input>`s.
- Each row: `id`, `name`, "Edit" (inspectors only — opens dialog with prefilled values), "Delete" (opens AlertDialog confirm).
- Mutations toast on success and on error (with the parsed `detail` from FastAPI's `HTTPException`).
- "Sign out (admin)" button at the bottom clears the token.

### Reports (`/reports`)
- Top: reused `<DailySummary />` card (refetches every 5 s).
- Middle: history table with limit selector (`<NativeSelect>` 10/50/100).
- Bottom: two buttons. "Download daily PDF" calls `api.generateDailyPdf()` → blob → object URL → click an `<a download>` element. "Send daily report" is disabled when `useSessionStore.adminToken` is null; otherwise calls `api.sendDailyReport(token)` and toasts the result.

### Dashboard (`/`)
Unchanged in shape; gets the new shadcn primitives transparently. The `success` and `danger` button variants used at `Dashboard.tsx:125,129` keep working via a CVA shim.

## API contract

No backend changes. The mission consumes the existing FastAPI endpoints inventoried in `kitty-specs/react-migration/spec.md`. Schemas in `frontend/src/lib/schemas.ts` mirror the Pydantic models at `backend/app/schemas.py`.

## Acceptance criteria

- [ ] Navigation to `/settings` and `/reports` does not throw a runtime import error.
- [ ] Adding an employee with a duplicate ID surfaces the backend's "Employee ID already exists" message; the row is not added.
- [ ] An invalid admin token causes the next admin call to return 401/403; the UI clears the token and re-prompts.
- [ ] "Download daily PDF" produces a non-empty PDF saved with a sensible filename.
- [ ] "Send daily report" is disabled when no admin token is present.
- [ ] Throwing an error in any route component is caught by the error boundary and renders a recoverable card with a "Reload" button.
- [ ] `frontend/biome.json` lints cleanly on all `src/**/*.{ts,tsx}` files (`npm run lint` exit 0).
- [ ] `pytest backend/tests/test_detector_core.py -v` passes; the test references `backend/tests/fixtures/reference_frames/` only.
- [ ] `Test-Path archive/legacy-streamlit/aoi_system_updated/app.py` returns True; `Test-Path aoi_system_updated` returns False.

## Deferred (out of scope for this mission)

- **"Send test email" button in Settings.** The legacy `email_sender.test_email_connection()` lives at `backend/legacy/email_sender.py` but is not exposed through FastAPI. Adding a `POST /api/admin/email/test` endpoint that calls it would be a ~10-line backend change but violates the no-backend-changes scope of this mission. Track in a follow-up.
- **Per-operator analytics view.** Reports today shows org-wide totals.
- **Pagination on history table.** A row-limit selector is sufficient for the v3 product.
