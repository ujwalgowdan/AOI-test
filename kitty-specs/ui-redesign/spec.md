# Spec — UI Redesign (Compact Console)

## Layout

| Area | Requirement |
|---|---|
| Header | White bar. Logo plus "Innotech AOI" on the left, a centred segmented nav (Dashboard / Reports / Settings), and a right-hand status chip: `SESSION LIVE · hh:mm:ss` with a green pulse, or `NO ACTIVE SESSION`. |
| Context bar (`/` only) | Operator, first-piece inspector and camera as one-line dropdown chips (name + ID + role). Chips are dashed when nothing is selected. A line / shift / date label sits on the right. |
| Camera card | Header row: "Inspection camera", zoom selector, camera selector. Feed: fills the viewport height, with teal (`#2dd4bf`) corner-bracket guide frame, LIVE tag, alignment pill and −/+ zoom buttons. Footer toolbar: Start session / CAPTURE (Space) / hint / End session. |
| Right rail (400px) | LAST CAPTURE (thumbnail, verdict, wire-swap reason, time, operator, inspector). TODAY (pass-rate donut, total / OK / NOT OK legend). Capture history (OK / NOT OK / PASS RATE tabs, 5 most recent captures). |
| Reports | Presets (Today / Last 7 days / This month / Custom range) that fill the date inputs. Summary strip (donut + totals). Captured images ZIP. Custom range PDF. NOT OK evidence strip. |
| Settings | Operators and first-piece inspectors tables with initials avatars. A Station card and an Admin card (signed-in identity, sign-out). |
| Footer | `AOI Tester - MKII`, plus `Sign out (admin)` when signed in. |

## Parity checklist (must all still work)

- [ ] Operator + inspector selection (locked while a session is live), START / STOP.
- [ ] Camera device selection, zoom 1×–5× (buttons, selector, `+` / `-` / `=` hotkeys), live feed.
- [ ] ROI overlay at the same fractions as `computeSourceRoi`.
- [ ] Detection badge: aligned (both wires) vs NOT DETECTED, with the "align both wires" hint.
- [ ] Capture via Space or button, gated on readiness.
- [ ] Last capture verdict. OK / NOT OK / PASS RATE tabs driven by the session WebSocket counts.
- [ ] Today counters (total / pass / fail / pass rate) from `/api/daily/summary`, refreshed on every count change.
- [ ] ZIP of captured JPEGs + `manifest.csv` with date range and result filter (admin-gated).
- [ ] Custom range PDF export.
- [ ] Operators add / delete. Inspectors add / edit / delete. Admin sign-in and sign-out.

## Data sources (no new endpoints)

| UI element | Source |
|---|---|
| Counts, last verdict, last image | `useSessionStore().session` (filled by `/analyze` and the WS `counts` payload) |
| Wire-swap reason, history rows, NOT OK evidence | `/analyze` responses kept in `src/store/captures.ts` (frontend-only, persisted to `localStorage`) |
| Today donut / Reports summary | `GET /api/daily/summary` |

## Known gaps (need a backend change, out of scope here)

- **Operator Edit:** the backend has no `PUT /api/employees/{id}`, so operators only get Add and Delete.
- **Full NOT OK evidence for a range:** there is no history/listing endpoint, so the strip only covers
  captures recorded by this browser. The ZIP (Result = NOT OK) remains the complete record.
- **Range summary:** `/api/daily/summary` covers today only, so the Reports summary strip is labelled "today".
- **Line / shift labels:** these are static constants in `src/lib/console.ts`, because no config endpoint exists.
