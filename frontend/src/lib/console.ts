// Pure helpers for the Compact Console UI. No React, no network — unit-tested
// in console.test.ts.

// ponytail: static station labels — no backend config endpoint exposes line or
// shift. Edit here if the station moves; promote to an API field if it varies.
export const STATION = {
  line: "Line 1",
  name: "AOI Tester",
  shift: "Shift A",
  target: "Wire interchange · green / yellow order",
} as const;

export type CaptureResult = "OK" | "NOT OK" | "NOT DETECTED";

function isSwap(detected: string[], expected: string[]): boolean {
  return (
    detected.length > 1 &&
    detected.length === expected.length &&
    detected.every((c, i) => c === expected[expected.length - 1 - i])
  );
}

/** Long, operator-facing reason line for the LAST CAPTURE card. */
export function captureReason(
  result: CaptureResult,
  detected: string[],
  expected: string[],
): string {
  if (result === "OK") return `Correct order · ${expected.join(" / ")}`;
  if (result === "NOT DETECTED" || detected.length === 0) {
    return "Wires not detected inside the guide frame";
  }
  if (isSwap(detected, expected)) return `Wire interchange - ${expected.join(" / ")} swapped`;
  return `Detected ${detected.join(" / ")} · expected ${expected.join(" / ")}`;
}

/** Short tag for history rows / evidence chips ("" for OK). */
export function shortReason(result: CaptureResult, detected: string[], expected: string[]): string {
  if (result === "OK") return "";
  if (result === "NOT DETECTED" || detected.length === 0) return "not detected";
  return isSwap(detected, expected) ? "wire swap" : "wrong order";
}

/** Pass rate in percent with one decimal, or null when there is nothing to rate. */
export function passRate(pass: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((pass / total) * 1000) / 10;
}

export function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : (parts[0]?.[1] ?? "");
  return (first + last).toUpperCase();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` in LOCAL time (toISOString is UTC and shifts the day on IST). */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `YYYY-MM-DDTHH:MM` in LOCAL time, the format `<input type="datetime-local">` uses. */
export function localDateTime(d: Date): string {
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function clockTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export type RangePreset = "today" | "7d" | "month" | "custom";

/** Start (00:00) and end (23:59 today) for a quick preset; null for custom. */
export function presetRange(
  preset: RangePreset,
  now = new Date(),
): { start: Date; end: Date } | null {
  const end = new Date(now);
  end.setHours(23, 59, 0, 0);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (preset === "today") return { start, end };
  if (preset === "7d") {
    start.setDate(start.getDate() - 6);
    return { start, end };
  }
  if (preset === "month") {
    start.setDate(1);
    return { start, end };
  }
  return null;
}
