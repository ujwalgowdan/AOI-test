import { describe, expect, it } from "vitest";

import {
  captureReason,
  elapsed,
  initials,
  localDate,
  localDateTime,
  passRate,
  presetRange,
  shortReason,
} from "./console";

const EXP = ["green", "yellow"];

describe("captureReason / shortReason", () => {
  it("describes a swapped pair as a wire interchange", () => {
    expect(captureReason("NOT OK", ["yellow", "green"], EXP)).toBe(
      "Wire interchange - green / yellow swapped",
    );
    expect(shortReason("NOT OK", ["yellow", "green"], EXP)).toBe("wire swap");
  });

  it("falls back to detected vs expected for other mismatches", () => {
    expect(captureReason("NOT OK", ["green", "green"], EXP)).toBe(
      "Detected green / green · expected green / yellow",
    );
    expect(shortReason("NOT OK", ["green", "green"], EXP)).toBe("wrong order");
  });

  it("handles OK and NOT DETECTED", () => {
    expect(captureReason("OK", EXP, EXP)).toBe("Correct order · green / yellow");
    expect(shortReason("OK", EXP, EXP)).toBe("");
    expect(shortReason("NOT DETECTED", [], EXP)).toBe("not detected");
  });
});

describe("passRate", () => {
  it("is null with no captures and one-decimal otherwise", () => {
    expect(passRate(0, 0)).toBeNull();
    expect(passRate(22, 24)).toBe(91.7);
    expect(passRate(5, 5)).toBe(100);
  });
});

describe("initials", () => {
  it("uses first + last word, or the first two letters of one word", () => {
    expect(initials("John Doe")).toBe("JD");
    expect(initials("Mr. Vinay")).toBe("MV");
    expect(initials("Alice")).toBe("AL");
    expect(initials("")).toBe("?");
  });
});

describe("dates", () => {
  const now = new Date(2026, 10, 16, 14, 2, 31); // 16 Nov 2026, local time

  it("formats local dates without UTC drift", () => {
    expect(localDate(now)).toBe("2026-11-16");
    expect(localDateTime(now)).toBe("2026-11-16T14:02");
    expect(elapsed(42 * 60_000 + 17_000)).toBe("00:42:17");
  });

  it("builds preset ranges ending today 23:59", () => {
    const today = presetRange("today", now);
    expect(today && localDateTime(today.start)).toBe("2026-11-16T00:00");
    expect(today && localDateTime(today.end)).toBe("2026-11-16T23:59");
    expect(localDate(presetRange("7d", now)?.start ?? now)).toBe("2026-11-10");
    expect(localDate(presetRange("month", now)?.start ?? now)).toBe("2026-11-01");
    expect(presetRange("custom", now)).toBeNull();
  });
});
