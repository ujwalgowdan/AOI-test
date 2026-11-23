# Implementation Plan — Frontend Upgrade

The full plan lives at `C:\Users\Admin\.claude\plans\take-the-reference-of-encapsulated-melody.md`. This file is the spec-kitty-conformant projection.

## Architecture decisions (ADR-style, brief)

- **ADR-1: Stay on Vite 5 / React 18 / Tailwind 3.** No React 19 or Tailwind v4 churn this cycle. The station is a single-machine kiosk; the present majors are stable and the team's familiarity outweighs the upside of a version bump.
- **ADR-2: Biome replaces ESLint + Prettier.** One config, one dependency, ~10× faster on ~25 source files. Drop-in for both linting and formatting.
- **ADR-3: Zod for runtime validation at the API boundary.** `frontend/src/lib/schemas.ts` defines `PersonSchema`, `SessionStateSchema`, `AnalyzeResponseSchema`, `DailySummarySchema`, `HistoryRowSchema`. `http<T>(path, schema?, init?)` parses through `schema.parse(json)` when supplied; TypeScript interfaces are deleted and types are derived via `z.infer<...>` so consumers (Dashboard etc.) need zero changes.
- **ADR-4: Keep NativeSelect; add `select-radix.tsx` for Settings forms.** Native `<select>` is touchscreen-friendly and avoids portal/z-index issues over the camera feed. Radix `Select` is reserved for keyboard-rich admin forms.
- **ADR-5: shadcn-style components written inline.** The shadcn-ui CLI is interactive and we work autonomously, so we hand-write the registry components (Dialog, Form, Table, Sonner Toaster, Label) following shadcn conventions. License-equivalent and avoids a fragile CLI call.
- **ADR-6: Test fixtures own their inputs.** Reference frames move to `backend/tests/fixtures/reference_frames/`, never to `archive/`. The archive must remain deletable without breaking any test.
- **ADR-7: Vitest + Playwright.** Vitest for unit; Playwright for one end-to-end smoke per route. No snapshot tests, no component tests for pure presentation.
- **ADR-8: Error boundary at the route shell.** A single `ErrorBoundary` in `App.tsx` wraps `<Routes>`. No per-component boundaries; the kiosk recovers via reload.

## Sequencing (matches `tasks.md`)

1. Mission scaffold.
2. Stub Settings + Reports routes (unblock app).
3. Tooling configs (biome, vitest, playwright, tsconfig.test).
4. ErrorBoundary + Toaster mount.
5. shadcn primitives upgrade (button with success/danger variants restored).
6. Radix Select component.
7. Zod schemas + typed client.
8. Settings page.
9. Reports page.
10. Vitest units.
11. Backend fixtures move + parity test patch.
12. Streamlit archive + Playwright smoke.

## Risks

- **shadcn primitive drift.** Hand-written components must keep the existing public exports (`Button`, `Card`, `CardHeader`, `CardTitle`, `CardContent`, `Input`) so Dashboard imports keep compiling. We add `success` and `danger` variants to the new CVA `buttonVariants` (Dashboard.tsx:125,129 uses these).
- **Parity-test path move.** Patching `REF_DIR` and moving frames must be a single commit; CI would otherwise see a window where the test path is wrong.
- **Backend untouched constraint.** Don't add or modify any router or service. The only backend file touched is `backend/tests/test_detector_core.py`, and only the `REF_DIR` constant.
- **getUserMedia over HTTP.** Browser requires HTTPS outside `localhost`; production deployment needs nginx TLS as documented in the predecessor mission. Unchanged here.
