# Tasks — UI Redesign (Compact Console)

Lanes: `planned` → `in_progress` → `for_review` → `done`.

## planned

- **T12 — Backend follow-ups (separate mission, backend scope).** `PUT /api/employees/{id}` (operator Edit), a capture
  listing endpoint (full NOT OK evidence + range summary), and station/shift config. Once they exist, swap the
  frontend fallbacks noted in `spec.md` → *Known gaps*.

## in_progress

(none)

## for_review

- **T11 — Visual check against wireframes.** Screenshots at 1440×900 (idle, live, Reports, Settings) and 390px mobile,
  taken with a fake camera and mocked API. Fixed the Reports donut label overflow and the overlap between the mobile
  alignment pill and the zoom buttons.

## done

- **T1 — Mission scaffold.** charter.md, spec.md, plan.md, tasks.md.
- **T2 — Helpers + tests.** `src/lib/console.ts` (reason text, presets, local date formats, initials, station constants)
  and `console.test.ts` (7 tests).
- **T3 — Capture log.** `src/store/captures.ts`: Zustand + `persist`, last 200 `/analyze` results.
- **T4 — Shell.** `App.tsx`: white header, segmented nav, live session chip with timer, footer with admin sign-out.
- **T5 — Context bar.** `ContextBar.tsx`: operator / inspector / camera chips that are native selects underneath.
  Dashed when empty, locked while a session is live.
- **T6 — Camera card.** `CameraView.tsx`: full-height feed, teal corner brackets at the unchanged ROI fractions, LIVE
  tag, aligned / NOT DETECTED pill, zoom selector + −/+ buttons, toolbar slot.
- **T7 — Right rail.** `LastResultCard` (thumbnail, verdict, wire-swap reason), `DailySummary` (TODAY donut, refetched
  on every count change), `CaptureHistory` (OK / NOT OK / PASS RATE tabs, 5 latest). Removed `CountsPanel`.
- **T8 — Reports.** Presets fill both exports' inputs. Summary strip. ZIP card made controlled. NOT OK evidence strip.
- **T9 — Settings.** Restyled tables with initials avatars and Edit / Del, info notes, Station and Admin cards. Sign-out
  moved out of `AdminGate`.
- **T10 — Quality gates.** lint, typecheck, unit tests (27), build and e2e (2) all pass. The fixes this needed were all
  in existing code:
  - `client.ts`: the `http` overloads were split by a helper, so typecheck already failed with TS2389.
  - `useCamera.ts:217`: an assignment-in-expression lint error. The refactor doesn't change behaviour.
  - `form.tsx`: labels weren't linked to their inputs (an a11y bug that also broke the settings e2e).
  - e2e fixtures: added mocks for `/api/auth/verify` and the stop-session call.
  - `NativeSelect`: now forwards `id` / `aria-label`.
