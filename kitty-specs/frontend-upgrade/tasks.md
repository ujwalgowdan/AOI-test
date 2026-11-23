# Tasks — Frontend Upgrade

Lanes: `planned` → `in_progress` → `for_review` → `done`.

## planned

(empty — all tasks claimed by the active mission run)

## in_progress

(tracked in `~/.claude` task list during the active build)

## for_review

(none yet)

## done

- **T1 — Mission scaffold.** Wrote charter.md, spec.md, plan.md, tasks.md.
- **T2 — Stub missing routes.** Added `frontend/src/routes/Settings.tsx` and `frontend/src/routes/Reports.tsx` so `App.tsx` no longer crashes on navigation.
- **T3 — Tooling configs.** Added `biome.json`, `vitest.config.ts`, `playwright.config.ts`, `tsconfig.test.json`. Updated `package.json` with new scripts and devDeps (Biome, Vitest, Testing Library, Playwright). Removed unused Radix Dialog/Label/Toast deps in favor of just `react-slot` and the ones we actually consume.
- **T4 — Error boundary + Toaster.** Added `frontend/src/components/ErrorBoundary.tsx`; wrapped routes in `App.tsx`. Mounted `<Toaster />` (sonner).
- **T5 — shadcn primitives upgrade.** Rewrote `button.tsx` with shadcn CVA + `success`/`danger`/`destructive` variants; added shadcn-style `dialog.tsx`, `form.tsx`, `table.tsx`, `label.tsx`, `sonner.tsx`. Added deps: `@radix-ui/react-dialog`, `@radix-ui/react-label`, `sonner`, `zod`, `react-hook-form`, `@hookform/resolvers`.
- **T6 — Radix Select component.** Added `frontend/src/components/ui/select-radix.tsx` using `@radix-ui/react-select`. `NativeSelect` kept for Dashboard.
- **T7 — Zod schemas + typed client.** Added `frontend/src/lib/schemas.ts`; refactored `frontend/src/api/client.ts` to `http<T>(path, schema?, init?)`; deleted manual interfaces and exported `z.infer` types.
- **T8 — Settings page.** Implemented `AdminGate`, `EmployeesCard`, `InspectorsCard`, replacing the T2 stub.
- **T9 — Reports page.** Implemented with limit selector, Download daily PDF, Send daily report.
- **T10 — Vitest units.** Added `client.test.ts`, `session.test.ts`, `useHotkey.test.ts`, `schemas.test.ts`.
- **T11 — Fixtures move + parity test patch.** Copied reference frames to `backend/tests/fixtures/reference_frames/`; patched `REF_DIR` in `backend/tests/test_detector_core.py`.
- **T12 — Streamlit archive + Playwright smoke.** Moved `aoi_system_updated/` to `archive/legacy-streamlit/`; updated root README. Added `e2e/dashboard.spec.ts` and `e2e/settings.spec.ts`.

> Task IDs mirror the implementation order. Lanes here are the canonical record; the `~/.claude` task list is the live working copy and is cleared on mission close.
