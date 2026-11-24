import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SAMPLE_DAYS, type SpcPoint, pChart, pct } from "@/lib/spc";

const BLUE = "var(--blue)";
const PASS = "rgb(var(--pass-rgb))";
const FAIL = "rgb(var(--fail-rgb))";
const MUTED = "var(--faint)";

/** Quality > SPC chart. Demo only: bundled sample data, no API calls. */
export default function SpcChart() {
  const r = pChart(SAMPLE_DAYS);
  const firstOut = r.points.findIndex((p) => p.out);
  const around = firstOut < 0 ? [] : r.points.slice(Math.max(0, firstOut - 2), firstOut + 4);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 p-3">
      <div className="flex flex-wrap items-center gap-3 px-1 pt-1">
        <h2 className="text-lg font-bold tx">SPC - NOT OK rate (p-chart)</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Avg NOT OK rate" value={pct(r.cl)} />
        <Stat label="Units inspected" value={r.inspected.toLocaleString("en-US")} />
        <Stat label="Days" value={String(r.points.length)} />
        <Stat label="Out-of-control points" value={String(r.outCount)} danger={r.outCount > 0} />
      </div>

      <section className="pane">
        <div className="pane-h">
          <span className="picon">◆</span>Daily NOT OK rate
          <span className="rt normal-case tracking-normal">
            Control limits per day's sample size
          </span>
        </div>
        <div className="p-3">
          <PChartSvg points={r.points} cl={r.cl} />
          <div className="mt-2 flex flex-wrap gap-5 text-xs tx2">
            <LegendItem color={BLUE}>Daily NOT OK rate</LegendItem>
            <LegendItem color={PASS}>Center line (avg)</LegendItem>
            <LegendItem color={FAIL} dashed>
              Control limits (UCL/LCL)
            </LegendItem>
          </div>
        </div>
      </section>

      <section className="pane">
        <div className="pane-h">
          <span className="picon">◆</span>Days around the out-of-control point
        </div>
        <div className="p-3">
          <div className="rounded-md border" style={{ borderColor: "var(--line)" }}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Inspected</TableHead>
                  <TableHead>NOT OK</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {around.map((p) => (
                  <TableRow key={p.day}>
                    <TableCell className="tx">{p.day}</TableCell>
                    <TableCell className="tabular-nums tx">{p.inspected}</TableCell>
                    <TableCell className="tabular-nums tx">{p.notOk}</TableCell>
                    <TableCell className="tabular-nums tx">{pct(p.p)}</TableCell>
                    <TableCell>
                      <SignalTag out={p.out} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="mt-2 text-xs txf">
            Sample data for demo. Counts are illustrative; a production p-chart would count
            independent cables only.
          </p>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="pane px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide txf">{label}</div>
      <div
        className="mt-1 text-2xl font-bold tabular-nums"
        style={{ color: danger ? FAIL : "var(--ink)" }}
      >
        {value}
      </div>
    </div>
  );
}

function SignalTag({ out }: { out: boolean }) {
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[11px] font-bold"
      style={
        out
          ? { background: "var(--red-fill)", color: FAIL }
          : { background: "var(--green-fill)", color: PASS }
      }
    >
      {out ? "out of control" : "in control"}
    </span>
  );
}

function LegendItem({
  color,
  dashed,
  children,
}: {
  color: string;
  dashed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <svg width="22" height="6" aria-hidden="true">
        <line
          x1="0"
          y1="3"
          x2="22"
          y2="3"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? "5 3" : undefined}
        />
      </svg>
      {children}
    </span>
  );
}

// Chart geometry in viewBox units; the SVG scales to the pane width.
const W = 1000;
const H = 360;
const M = { l: 64, r: 44, t: 30, b: 34 };

function PChartSvg({ points, cl }: { points: SpcPoint[]; cl: number }) {
  const top = Math.max(0.1, ...points.map((p) => Math.max(p.ucl, p.p)));
  const yMax = Math.ceil(top * 50 - 1e-9) / 50; // round up to the next 2%
  const ticks = Array.from({ length: Math.round(yMax / 0.02) + 1 }, (_, i) => i * 0.02);
  const x = (i: number) => M.l + (i * (W - M.l - M.r)) / Math.max(1, points.length - 1);
  const y = (v: number) => M.t + (1 - v / yMax) * (H - M.t - M.b);
  const line = (f: (p: SpcPoint) => number) =>
    points.map((p, i) => `${x(i).toFixed(1)},${y(f(p)).toFixed(1)}`).join(" ");
  const last = points.length - 1;
  const outs = points.filter((p) => p.out).length;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full"
      role="img"
      aria-label={`p-chart of daily NOT OK rate over ${points.length} days, center line ${pct(cl)}, ${outs} out-of-control point(s)`}
      style={{ fontFamily: "inherit" }}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
          <text x={M.l - 10} y={y(t) + 4} textAnchor="end" fontSize="12" fill={MUTED}>
            {`${Math.round(t * 100)}%`}
          </text>
        </g>
      ))}
      <text
        transform={`translate(16 ${(M.t + H - M.b) / 2}) rotate(-90)`}
        textAnchor="middle"
        fontSize="12"
        fill={MUTED}
      >
        NOT OK rate per day
      </text>

      {points.map((p, i) =>
        // every other day, counted back from the last so the final day is always labelled
        (last - i) % 2 === 0 ? (
          <text key={p.day} x={x(i)} y={H - 10} textAnchor="middle" fontSize="12" fill={MUTED}>
            {p.day}
          </text>
        ) : null,
      )}

      <polyline
        points={line((p) => p.ucl)}
        fill="none"
        stroke={FAIL}
        strokeWidth="2"
        strokeDasharray="7 5"
      />
      <polyline
        points={line((p) => p.lcl)}
        fill="none"
        stroke={FAIL}
        strokeWidth="2"
        strokeDasharray="7 5"
      />
      <text
        x={x(last) + 8}
        y={y(points[last]?.ucl ?? 0) + 4}
        textAnchor="start"
        fontSize="13"
        fontWeight="700"
        fill={FAIL}
      >
        UCL
      </text>

      <line x1={M.l} x2={W - M.r} y1={y(cl)} y2={y(cl)} stroke={PASS} strokeWidth="2.5" />
      <text
        x={x(last - 2)}
        y={y(cl) - 9}
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill={PASS}
      >
        {`CL = ${pct(cl)}`}
      </text>

      <polyline
        points={line((p) => p.p)}
        fill="none"
        stroke={BLUE}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {points.map((p, i) => (
        <circle key={p.day} cx={x(i)} cy={y(p.p)} r={p.out ? 7 : 4.5} fill={p.out ? FAIL : BLUE}>
          <title>{`${p.day}: ${p.notOk}/${p.inspected} = ${pct(p.p)} (UCL ${pct(p.ucl)})`}</title>
        </circle>
      ))}
      {points.map((p, i) =>
        p.out ? (
          <text
            key={`${p.day}-label`}
            x={x(i)}
            y={y(p.p) - 14}
            textAnchor="middle"
            fontSize="13"
            fontWeight="700"
            fill={FAIL}
          >
            {`${pct(p.p)} - special cause`}
          </text>
        ) : null,
      )}
    </svg>
  );
}
