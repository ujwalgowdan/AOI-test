// Verdict beeps via the Web Audio API — no audio files, no dependencies.

export interface Beep {
  at: number; // seconds from cue start
  freq: number; // Hz
  dur: number; // seconds
}

const BEEP = 0.15;

/** One high beep for OK, two low beeps for NOT OK, silence otherwise. */
export function beepSchedule(result: string | null | undefined): Beep[] {
  if (result === "OK") return [{ at: 0, freq: 880, dur: BEEP }];
  if (result === "NOT OK") {
    return [
      { at: 0, freq: 440, dur: BEEP },
      { at: 0.22, freq: 440, dur: BEEP },
    ];
  }
  return [];
}

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC =
    globalThis.AudioContext ??
    (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  return ctx;
}

/** Call from a user gesture so the browser lets the context run later. */
export function unlockAudio() {
  const c = audio();
  if (c?.state === "suspended") void c.resume();
}

export function playVerdict(result: string | null | undefined) {
  const beeps = beepSchedule(result);
  if (beeps.length === 0) return;
  const c = audio();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const t0 = c.currentTime + 0.01;
  for (const b of beeps) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "sine";
    osc.frequency.value = b.freq;
    // Short attack/release ramps avoid clicks; peak gain kept modest.
    const start = t0 + b.at;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + b.dur);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + b.dur + 0.01);
  }
}
