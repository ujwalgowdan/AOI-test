# Plan — UX Enhancements 2 + 6

1. **`useReadinessProbe`**: also keep the payload's `expected[]` in the ready / not_detected states. This is additive only;
   the polling, gating and status values are unchanged.
2. **`CameraView`**: `WireChips` renders mini pills at the top-right, mirroring the LIVE badge (Option A). This replaced the
   first bottom-left version.
3. **`src/lib/sound.ts`**: `beepSchedule(result)` is the pure, unit-tested part. `playVerdict()` and `unlockAudio()` are the thin
   Web Audio wrappers.
4. **`src/store/sound.ts`**: a tiny Zustand store for `aoi.soundOn`. It is separate from `session.ts`, so the admin token code is
   untouched.
5. **`App.tsx`**: a `SoundToggle` icon button beside the session chip, plus a `useVerdictSound()` effect that subscribes to
   `useSessionStore` and beeps on each new capture.
6. **Tests**: `sound.test.ts` covers the schedule shape, the duration limit, and that NOT DETECTED is silent.
