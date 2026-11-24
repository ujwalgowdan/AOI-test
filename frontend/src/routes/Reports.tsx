import { CalendarRange, Download, ImageOff } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { withStationToken } from "@/api/client";
import { CapturesDownloadCard } from "@/components/CapturesDownloadCard";
import { useDailySummary } from "@/components/DailySummary";
import { PassRateDonut } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  type RangePreset,
  clockTime,
  localDate,
  localDateTime,
  presetRange,
  shortReason,
} from "@/lib/console";
import { downloadRangePdf } from "@/lib/rangeReport";
import { cn } from "@/lib/utils";
import { useCapturesStore } from "@/store/captures";

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "Last 7 days" },
  { id: "month", label: "This month" },
  { id: "custom", label: "Custom range" },
];

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Valid `?start=&end=` dates (YYYY-MM-DD, real dates, start <= end), else null. */
export function zipQueryRange(p: URLSearchParams): { start: string; end: string } | null {
  const start = p.get("start") ?? "";
  const end = p.get("end") ?? "";
  const real = (d: string) =>
    ISO_DAY.test(d) &&
    !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) &&
    new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
  return real(start) && real(end) && start <= end ? { start, end } : null;
}

// Initial state: "Today" for both exports.
const initial = presetRange("today") ?? { start: new Date(), end: new Date() };

export default function Reports() {
  const [preset, setPreset] = useState<RangePreset>("today");
  // The assistant's ZIP action links here as /reports?start=YYYY-MM-DD&end=YYYY-MM-DD;
  // only the ZIP dates are pre-filled, the download still needs the admin's click.
  const [params] = useSearchParams();
  const qs = zipQueryRange(params);
  // ZIP uses plain dates; the PDF endpoint takes local date-times.
  const [zipStart, setZipStart] = useState(() => qs?.start ?? localDate(initial.start));
  const [zipEnd, setZipEnd] = useState(() => qs?.end ?? localDate(initial.end));
  const [rangeStart, setRangeStart] = useState(() => localDateTime(initial.start));
  const [rangeEnd, setRangeEnd] = useState(() => localDateTime(initial.end));
  const [rangeDownloading, setRangeDownloading] = useState(false);

  const applyPreset = (p: RangePreset) => {
    setPreset(p);
    const r = presetRange(p);
    if (!r) return; // custom: keep whatever is in the inputs
    setZipStart(localDate(r.start));
    setZipEnd(localDate(r.end));
    setRangeStart(localDateTime(r.start));
    setRangeEnd(localDateTime(r.end));
  };
  // Any manual edit means the range no longer matches a preset.
  const custom =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setPreset("custom");
    };

  const onDownloadRange = () => downloadRangePdf(rangeStart, rangeEnd, setRangeDownloading);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 p-3">
      <div className="pane-h" style={{ border: "none", padding: "4px 4px 0" }}>
        <span className="picon">◆</span>
        <h2 className="text-xs font-bold uppercase tracking-[0.06em]">Reports</h2>
        <span className="rt">Evidence and exports for the quality team</span>
      </div>

      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Date range preset</legend>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={preset === p.id}
            onClick={() => applyPreset(p.id)}
            className={cn(
              "rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition",
              preset === p.id
                ? "border-innotech bg-innotech text-white shadow-sm"
                : "border-[var(--line)] bg-[var(--card)] text-[var(--ink2)] hover:border-[var(--line-strong)]",
            )}
          >
            {p.label}
          </button>
        ))}
      </fieldset>

      <SummaryStrip />

      <div className="grid gap-4 md:grid-cols-2">
        <CapturesDownloadCard
          start={zipStart}
          end={zipEnd}
          onStart={custom(setZipStart)}
          onEnd={custom(setZipEnd)}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4" /> Custom range PDF
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-[var(--ink2)]">
              Pick a start and end date / time to bundle every capture in that window into a PDF
              report.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--faint)]">
                  Start
                </span>
                <Input
                  type="datetime-local"
                  value={rangeStart}
                  max={rangeEnd || undefined}
                  onChange={(e) => custom(setRangeStart)(e.target.value)}
                  disabled={rangeDownloading}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs uppercase tracking-wide text-[var(--faint)]">
                  End
                </span>
                <Input
                  type="datetime-local"
                  value={rangeEnd}
                  min={rangeStart || undefined}
                  onChange={(e) => custom(setRangeEnd)(e.target.value)}
                  disabled={rangeDownloading}
                />
              </label>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={onDownloadRange}
                disabled={rangeDownloading || !rangeStart || !rangeEnd}
              >
                <Download className="mr-1 h-4 w-4" />
                {rangeDownloading ? "Generating…" : "Download range PDF"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <NotOkStrip start={zipStart} end={zipEnd} />
    </div>
  );
}

function SummaryStrip() {
  const { data } = useDailySummary();
  const s = data?.summary;
  const total = s?.total_count ?? 0;
  const pass = s?.pass_count ?? 0;
  const fail = s?.fail_count ?? 0;
  return (
    <Card className="flex flex-wrap items-center gap-x-10 gap-y-3 rounded-xl px-5 py-4">
      <PassRateDonut pass={pass} total={total} size={76} />
      <Stat value={total} label="Captures today" className="text-[var(--ink)]" />
      <Stat value={pass} label="OK" className="text-pass" />
      <Stat value={fail} label="NOT OK" className="text-fail" />
    </Card>
  );
}

function Stat({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className="min-w-24">
      <div className={cn("text-2xl font-bold tabular-nums", className)}>{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--faint)]">
        {label}
      </div>
    </div>
  );
}

/** NOT OK captures this station recorded inside the ZIP date range. */
function NotOkStrip({ start, end }: { start: string; end: string }) {
  const records = useCapturesStore((s) => s.records);
  const rows = records.filter((r) => {
    const day = localDate(new Date(r.at));
    return r.result === "NOT OK" && day >= start && day <= end;
  });

  return (
    <Card className="rounded-xl p-4">
      <h3 className="text-sm font-semibold text-[var(--ink)]">
        NOT OK captures in the selected range
        <span className="ml-2 text-xs font-normal text-[var(--faint)]">
          tap a thumbnail to open full evidence
        </span>
      </h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-xs text-[var(--faint)]">
          No NOT OK captures recorded on this station in this range.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((r) => (
            <li key={`${r.sessionId}-${r.at}`}>
              <a
                href={withStationToken(r.imageUrl)}
                target="_blank"
                rel="noreferrer"
                className="group relative block aspect-video overflow-hidden rounded-lg border-2 border-fail bg-slate-900"
              >
                {r.imageUrl ? (
                  <img
                    src={withStationToken(r.imageUrl)}
                    alt={`NOT OK capture #${r.seq}`}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                ) : (
                  <ImageOff className="m-auto mt-8 h-6 w-6 text-[var(--faint)]" />
                )}
                <span className="absolute left-1.5 top-1.5 rounded bg-black/60 px-1.5 text-[10px] text-white">
                  {localDate(new Date(r.at)) === localDate(new Date())
                    ? ""
                    : `${localDate(new Date(r.at))} `}
                  {clockTime(new Date(r.at))}
                </span>
                <span className="absolute bottom-1.5 left-1.5 rounded bg-fail px-1.5 text-[10px] font-bold text-white">
                  #{r.seq} {shortReason(r.result, r.detected, r.expected)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] text-[var(--faint)]">
        Shows captures made in this browser. For the complete record, download the ZIP with Result
        set to NOT OK only.
      </p>
    </Card>
  );
}
