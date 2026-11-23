# Mission Charter — UI Redesign (Variant 3: Compact Console)

**Mission slug:** `ui-redesign`
**Owner:** AOI engineering (DigiBull AI)
**Status:** in progress
**Source:** `AOI-UI-Redesign-V3-Compact-Console-Wireframes-and-Claude-Prompt.pdf` (16 Nov 2026)
**Predecessor:** `kitty-specs/frontend-upgrade/`

## Why

Operators already know the current light layout. The Compact Console variant keeps that layout and
terminology but tidies it: the camera feed takes the whole viewport height, session context moves
into a one-line chip bar, and the verdict, today's pass rate and recent captures sit in one right rail.
The goal is a modern look with no retraining.

## Scope

- **In:** `frontend/` only. That covers the header, footer, Dashboard, Reports and Settings routes, and the
  presentational components behind them.
- **Out:** everything in `backend/`. The REST API, `/ws/session/{id}` protocol and the Zod schemas in
  `src/lib/schemas.ts` are frozen contracts.

## Non-negotiables

1. No feature is dropped. See the parity list in `spec.md`.
2. Branding: "Innotech AOI", "AOI Tester - MKII", the blue brand identity, and the OK / NOT OK / PASS RATE wording.
3. `src/store/session.ts`, `src/hooks/useCamera.ts` and `src/hooks/useSessionSocket.ts` are reused as they are.
4. All network calls stay in `src/api/client.ts`.
5. The ROI overlay keeps the fractions that `useCamera.computeSourceRoi` mirrors (`1/3, 37.5%, 1/3, 1/4`).
6. Quality gates pass: `npm run lint ; npm run typecheck ; npm run test ; npm run build`, plus e2e.
