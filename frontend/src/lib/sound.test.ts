import { describe, expect, it } from "vitest";

import { beepSchedule } from "./sound";

const length = (r: string) => Math.max(0, ...beepSchedule(r).map((b) => b.at + b.dur));

describe("beepSchedule", () => {
  it("plays one beep for OK and two for NOT OK", () => {
    expect(beepSchedule("OK")).toHaveLength(1);
    expect(beepSchedule("NOT OK")).toHaveLength(2);
  });

  it("is silent for NOT DETECTED or no result", () => {
    expect(beepSchedule("NOT DETECTED")).toEqual([]);
    expect(beepSchedule(null)).toEqual([]);
  });

  it("keeps every cue under 600ms with a gap between NOT OK beeps", () => {
    expect(length("OK")).toBeLessThan(0.6);
    expect(length("NOT OK")).toBeLessThan(0.6);
    const [a, b] = beepSchedule("NOT OK");
    expect(b && a && b.at).toBeGreaterThan((a?.at ?? 0) + (a?.dur ?? 0));
  });
});
