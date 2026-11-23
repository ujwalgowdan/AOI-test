import { Download, ImageOff } from "lucide-react";
import { useState } from "react";

import { withStationToken } from "@/api/client";
import { ResultPill } from "@/components/console";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { clockTime, passRate, shortReason } from "@/lib/console";
import { downloadRangePdf, stationDayBounds } from "@/lib/rangeReport";
import { cn } from "@/lib/utils";
import { useCapturesStore } from "@/store/captures";
import { useSessionStore } from "@/store/session";

type Tab = "OK" | "NOT OK" | "PASS RATE";

/** OK / NOT OK / PASS RATE tabs (counts from the session WebSocket) over the
 *  five most recent captures of the current session. PASS RATE shows all. */
export function CaptureHistory() {
  const session = useSessionStore((s) => s.session);
  const all = useCapturesStore((s) => s.records);
  const [tab, setTab] = useState<Tab>("PASS RATE");

  const ok = session?.ok_count ?? 0;
  const notOk = session?.not_ok_count ?? 0;
  const rate = passRate(ok, ok + notOk);
  const rows = all
    .filter((r) => r.sessionId === session?.id && (tab === "PASS RATE" || r.result === tab))
    .slice(0, 5);

  const tabs: { id: Tab; label: string; tone: string }[] = [
    {
      id: "OK",
      label: `OK · ${ok}`,
      tone: "data-[on=true]:bg-pass/15 data-[on=true]:text-emerald-700",
    },
    {
      id: "NOT OK",
      label: `NOT OK · ${notOk}`,
      tone: "data-[on=true]:bg-fail/15 data-[on=true]:text-red-700",
    },
    {
      id: "PASS RATE",
      label: `PASS RATE${rate === null ? "" : ` · ${rate}%`}`,
      tone: "data-[on=true]:bg-innotech/10 data-[on=true]:text-innotech",
    },
  ];

  return (
    <Card className="rounded-xl p-3">
      <div role="tablist" aria-label="Capture history" className="grid grid-cols-3 gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-on={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "truncate rounded-md bg-slate-100 px-1 py-1.5 text-[11px] font-bold tabular-nums text-slate-500 transition hover:bg-slate-200",
              t.tone,
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="mt-2">
        {rows.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-slate-500">
            {!session
              ? "Capture history appears here once the session starts."
              : tab === "PASS RATE"
                ? "No captures yet in this session."
                : `No ${tab} captures yet in this session.`}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const why = shortReason(r.result, r.detected, r.expected);
              return (
                <li
                  key={`${r.sessionId}-${r.at}`}
                  className="flex items-center gap-2.5 px-1 py-1.5"
                >
                  <div className="h-8 w-12 shrink-0 overflow-hidden rounded bg-slate-900">
                    {r.imageUrl ? (
                      <img
                        src={withStationToken(r.imageUrl)}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageOff className="m-auto mt-2 h-4 w-4 text-slate-500" />
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-700">
                    <b className="tabular-nums">#{r.seq}</b> · {clockTime(new Date(r.at))}
                    {why && ` · ${why}`}
                  </span>
                  <ResultPill result={r.result} />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ExportDailyReport />
    </Card>
  );
}

/** Today's full report (all sessions, 00:00-23:59 Asia/Kolkata) through the
 *  Reports page's range-PDF flow: same endpoint, permissions, file and errors. */
function ExportDailyReport() {
  const [busy, setBusy] = useState(false);
  const onExport = () => {
    const { start, end } = stationDayBounds();
    return downloadRangePdf(start, end, setBusy);
  };
  return (
    <Button
      variant="outline"
      onClick={onExport}
      disabled={busy}
      className="mt-2 w-full border-innotech/30 text-innotech hover:bg-innotech/5"
    >
      <Download className="h-4 w-4" />
      {busy ? "Generating…" : "Export daily report"}
    </Button>
  );
}
