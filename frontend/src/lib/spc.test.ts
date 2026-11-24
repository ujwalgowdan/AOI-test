import { describe, expect, it } from "vitest";

import { SAMPLE_DAYS, pChart, pct } from "./spc";

describe("pChart on the demo sample", () => {
  const r = pChart(SAMPLE_DAYS);

  it("matches the headline numbers", () => {
    expect(SAMPLE_DAYS).toHaveLength(20);
    expect(r.inspected).toBe(2726);
    expect(r.notOk).toBe(106);
    expect(pct(r.cl)).toBe("3.9%");
  });

  it("uses per-day limits with LCL floored at 0", () => {
    for (const p of r.points) {
      expect(p.lcl).toBeGreaterThanOrEqual(0);
      expect(p.ucl).toBeCloseTo(r.cl + 3 * Math.sqrt((r.cl * (1 - r.cl)) / p.inspected));
    }
    // smaller sample -> wider limit
    const uclAt = (n: number) => r.points.find((p) => p.inspected === n)?.ucl ?? 0;
    expect(uclAt(102)).toBeGreaterThan(uclAt(158));
  });

  it("flags only Nov 16 (9.9%) as out of control", () => {
    expect(r.outCount).toBe(1);
    const out = r.points.filter((p) => p.out).map((p) => [p.day, pct(p.p)]);
    expect(out).toEqual([["Nov 16", "9.9%"]]);
  });
});
