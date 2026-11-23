# Plan — UI Redesign (Compact Console)

## Approach

Restyle the existing components in place. No new dependencies are needed: Tailwind, lucide and Zustand
(`persist`) cover everything.

1. **Shell (`App.tsx`)**: a full-height flex column, so the Dashboard can fill the viewport. Each route owns its own padding.
2. **Shared bits**: `src/lib/console.ts` holds the pure helpers (reason text, presets, date formats, initials,
   station constants), with tests in `console.test.ts`. `src/components/console.tsx` holds the donut, result pill and avatar.
3. **Capture log**: `src/store/captures.ts` keeps the last 200 `/analyze` results with their session id. Both the
   Dashboard rail and the Reports evidence strip read from it. `session.ts` stays untouched.
4. **Dashboard**: `ContextBar` (chip selects layered over native `<select>` for accessibility), a rewritten
   `CameraView` with a toolbar slot, `LastResultCard`, `DailySummary` (TODAY donut), and `CaptureHistory`
   (replaces `CountsPanel`).
5. **Reports**: preset state lifted into the route. `CapturesDownloadCard` becomes controlled (start/end props).
6. **Settings**: a two-column grid with restyled tables, plus Station and Admin cards. The sign-out button moves from
   `AdminGate` into the Admin card and the footer.
7. **Tests**: unit tests for the helpers. The e2e dashboard spec is updated to the new chips, idle state and Start session control.

## Risks

- **ROI alignment:** the feed now has a non-16:9 box. `computeSourceRoi` already handles any aspect ratio, because it reads the
  video's rendered rect, so the overlay must stay a direct child of the same box as the `<video>`.
- **E2E locators:** the dashboard e2e test selected `select` elements by index. The new chips keep native selects
  with `aria-label`s, so the tests target those instead.
