# Mission Charter — UX Enhancements 2 + 6

**Mission slug:** `ux-enhancements`
**Owner:** AOI engineering (DigiBull AI)
**Status:** in progress
**Source:** `AOI-UX-Enhancements-2-6-Wireframe-and-Claude-Prompt.pdf` (16 Nov 2026)
**Predecessor:** `kitty-specs/ui-redesign/` (Compact Console, in place)

## Why

- **Enhancement 2:** the NOT DETECTED pill tells operators that something is missing, but not *which* wire.
  Per-wire chips make the fix obvious.
- **Enhancement 6:** operators watch the cable rather than the screen. An audible OK / NOT OK cue confirms each verdict
  without looking up.

## Scope

- **In:** `frontend/` only. That covers the per-wire chips on the camera feed, verdict beeps, and the icon-only sound toggle in the header.
- **Out:** `backend/` and its frozen contracts (REST, `/ws/session/{id}`, `src/lib/schemas.ts`), plus every other visual or
  behavioural change.

## Non-negotiables

1. The chips are informational. The capture enable/disable logic does not change.
2. Beeps use the Web Audio API only: no audio files, no new dependencies, under 600 ms.
3. The toggle is an icon only. "Sound on" / "Sound off" appears only as the hover tooltip.
4. A new `localStorage` key `aoi.soundOn`, default on. `aoi.adminToken` and the other keys are untouched.
5. Quality gates pass: lint, typecheck, test, build.
