# Spec — UX Enhancements 2 + 6

## Enhancement 2 — per-wire status, top-right mini pills (Option A, revised)

> **Revision (Option A):** the first version put larger chips at the bottom-left. They took too much space, so they were
> removed and re-rendered as mini pills in the **top-right** corner. The data source is the same.

| Item | Requirement |
|---|---|
| Position | Top-right of the feed, mirroring the LIVE badge: same 12 px inset, same height (23 px), same 10 px bold uppercase type. The guide frame, the NOT DETECTED pill and the zoom buttons stay unobstructed. |
| Chips | One per **expected** colour, in the order the detector reports. |
| Detected | Filled pill in the wire's colour, showing a check mark and the short name: `✓ GREEN`. |
| Missing | Dark pill with a dashed amber outline: `✗ YELLOW`. |
| Tooltip | The full wording only appears on hover, as a native `title` (no Radix Tooltip in the project): `YELLOW WIRE - not found` / `GREEN WIRE - detected`. Screen readers get the same text through an `sr-only` span. |
| Data | The per-colour fields of the live `/api/detect/peek` payload: `detected[]` and `expected[]`. This is the same payload that drives the aligned / NOT DETECTED pill. The chips are not inferred from the verdict, and there is no new backend call. |
| When shown | Whenever the readiness probe has a reading, which is the same condition as the pill. In idle (no session) the probe is deliberately off, so no detection payload exists and the chips stay hidden instead of guessing. |
| Capture gating | Unchanged. |

The live pre-capture payload already carries per-colour presence, so the fallback (driving the chips from the last
`/analyze` response) is not needed.

## Enhancement 6 — verdict beeps with an icon-only toggle

| Item | Requirement |
|---|---|
| Trigger | The session-store update that refreshes LAST CAPTURE: a new `last_image_url` within the same session, from either `/analyze` or the WS `counts` message. A duplicate WS echo of the same capture does not beep again. |
| Cue | **OK**: one short high beep. **NOT OK**: two short low beeps. NOT DETECTED: silent. Total length is under 600 ms, at modest gain. |
| Engine | A Web Audio `AudioContext` oscillator, created or resumed on the first user gesture (pointer or key) and resumed again before each cue if it was suspended. |
| Toggle | A speaker icon button in the header (`Volume2` / `VolumeX` from lucide). There is no visible text. The tooltip is a native `title` reading "Sound on" or "Sound off", because the project has no Radix Tooltip. It also has `aria-pressed` and `aria-label`. |
| Persistence | `localStorage["aoi.soundOn"]` is `"1"` or `"0"`, default on. Reads and writes are wrapped in try/catch. |
| Scope | Mounted in `App`, so it works in idle and live states and survives Dashboard re-mounts. |
