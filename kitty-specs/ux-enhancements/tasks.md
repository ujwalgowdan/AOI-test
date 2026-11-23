# Tasks — UX Enhancements 2 + 6

Lanes: `planned` → `in_progress` → `for_review` → `done`.

## planned

(none)

## in_progress

(none)

## for_review

- **T6 — On-station check.** Listen to the beeps on the real station speakers and adjust the gain (0.18) or the pitches
  (OK 880 Hz, NOT OK 440 Hz) in `src/lib/sound.ts` if they are too quiet or harsh on the shop floor.

## done

- **T1 — Mission scaffold.** charter.md, spec.md, plan.md, tasks.md.
- **T2 — Probe carries `expected`.** `useReadinessProbe` keeps the `expected[]` that the peek payload already returns. Additive only.
- **T3 — Per-wire chips.** `WireChips` in `CameraView.tsx` sits bottom-left above the pill. Detected chips are filled with
  a check mark, missing chips have a dashed amber outline and say "not found". The capture gating is untouched. On phones
  the pill moves up a row so it doesn't overlap.
- **T4 — Verdict beeps.** `src/lib/sound.ts` (Web Audio, under 600 ms) and `src/store/sound.ts` (`aoi.soundOn`, default on).
  `useVerdictSound` + `SoundToggle` live in `App.tsx`. The toggle has an icon only, with a `title` tooltip.
- **T7 — Option A move.** Removed the bottom-left chips and rendered them as top-right mini pills that mirror LIVE. The
  full wording now only appears in the hover tooltip. The phone-only shift of the NOT DETECTED pill was reverted, since it only
  existed to make room for the old chips. A browser check confirmed that the pills are the same height and inset as LIVE (23 px / 12 px) and
  overlap none of the guide frame, the pill or the zoom buttons.
- **T5 — Verification.** Lint, typecheck, unit tests (30, including `sound.test.ts`), build and e2e (2) pass. A browser check with a
  fake camera and mocked API confirmed:
  - the chips in both states;
  - OK gives 1 oscillator start and NOT OK gives 2;
  - no beep when muted;
  - the "Sound on" / "Sound off" tooltip, the toggle having no visible text, and the setting surviving a reload.
