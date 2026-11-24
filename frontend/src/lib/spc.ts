/** p-chart (fraction nonconforming) maths + bundled demo data for the
 *  Quality > SPC chart page. Frontend-only: nothing here touches the API. */

export type SpcDay = { day: string; inspected: number; notOk: number };

export type SpcPoint = SpcDay & {
  /** NOT OK rate for the day (0..1). */
  p: number;
  ucl: number;
  lcl: number;
  out: boolean;
};

// ponytail: hard-coded demo sample (Nov 5-24). Swap for /api data when SPC goes live.
// Totals: 2,726 inspected, 106 NOT OK -> CL 3.9%. Nov 16 (15/151 = 9.9%) is the
// one special cause; every other day sits well inside its own limits.
export const SAMPLE_DAYS: SpcDay[] = [
  { day: "Nov 5", inspected: 130, notOk: 5 },
  { day: "Nov 6", inspected: 146, notOk: 6 },
  { day: "Nov 7", inspected: 142, notOk: 4 },
  { day: "Nov 8", inspected: 150, notOk: 6 },
  { day: "Nov 9", inspected: 98, notOk: 3 },
  { day: "Nov 10", inspected: 150, notOk: 5 },
  { day: "Nov 11", inspected: 144, notOk: 5 },
  { day: "Nov 12", inspected: 148, notOk: 5 },
  { day: "Nov 13", inspected: 128, notOk: 4 },
  { day: "Nov 14", inspected: 158, notOk: 6 },
  { day: "Nov 15", inspected: 102, notOk: 4 },
  { day: "Nov 16", inspected: 151, notOk: 15 },
  { day: "Nov 17", inspected: 145, notOk: 5 },
  { day: "Nov 18", inspected: 150, notOk: 6 },
  { day: "Nov 19", inspected: 153, notOk: 5 },
  { day: "Nov 20", inspected: 152, notOk: 5 },
  { day: "Nov 21", inspected: 130, notOk: 4 },
  { day: "Nov 22", inspected: 112, notOk: 4 },
  { day: "Nov 23", inspected: 147, notOk: 6 },
  { day: "Nov 24", inspected: 90, notOk: 3 },
];

/** Standard p-chart: CL = total NOT OK / total inspected; limits are
 *  CL ± 3·sqrt(CL·(1−CL)/n) using each day's own sample size n, LCL floored at 0. */
export function pChart(days: SpcDay[]) {
  const inspected = days.reduce((s, d) => s + d.inspected, 0);
  const notOk = days.reduce((s, d) => s + d.notOk, 0);
  const cl = inspected ? notOk / inspected : 0;
  const points: SpcPoint[] = days.map((d) => {
    const sigma3 = 3 * Math.sqrt((cl * (1 - cl)) / d.inspected);
    const p = d.notOk / d.inspected;
    const ucl = cl + sigma3;
    const lcl = Math.max(0, cl - sigma3);
    return { ...d, p, ucl, lcl, out: p > ucl || p < lcl };
  });
  return { cl, inspected, notOk, points, outCount: points.filter((p) => p.out).length };
}

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
