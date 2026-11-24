import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api } from "@/api/client";
import { Eyebrow, PassRateDonut } from "@/components/console";
import { Card } from "@/components/ui/card";
import { useSessionStore } from "@/store/session";

export function useDailySummary() {
  // Only poll while a session is running; nothing changes the daily totals
  // while idle, so this keeps the backend quiet between START and STOP.
  const active = useSessionStore((s) => !!s.session?.active);
  return useQuery({
    queryKey: ["daily-summary"],
    queryFn: api.dailySummary,
    refetchInterval: active ? 5_000 : false,
  });
}

function dayLabel(iso?: string): string {
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function Legend({ total, ok, notOk }: { total: number; ok: number; notOk: number }) {
  return (
    <ul className="space-y-1.5 text-xs text-[var(--ink2)]">
      <li className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm bg-[var(--ink2)]" />
        <b className="tabular-nums">{total}</b> total captures
      </li>
      <li className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm bg-pass" />
        <b className="tabular-nums">{ok}</b> OK
      </li>
      <li className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm bg-fail" />
        <b className="tabular-nums">{notOk}</b> NOT OK
      </li>
    </ul>
  );
}

/** TODAY card: totals from /api/daily/summary, refreshed on every WS count change. */
export function DailySummary() {
  const { data } = useDailySummary();
  const qc = useQueryClient();
  const ok = useSessionStore((s) => s.session?.ok_count ?? 0);
  const notOk = useSessionStore((s) => s.session?.not_ok_count ?? 0);

  // A capture just landed (via /analyze or the session socket) — pull the new
  // daily totals now instead of waiting for the next poll.
  useEffect(() => {
    if (ok + notOk > 0) void qc.invalidateQueries({ queryKey: ["daily-summary"] });
  }, [ok, notOk, qc]);

  const s = data?.summary;
  const total = s?.total_count ?? 0;
  const pass = s?.pass_count ?? 0;
  const fail = s?.fail_count ?? 0;

  return (
    <Card className="rounded-xl p-4">
      <Eyebrow>Today · {dayLabel(data?.date)}</Eyebrow>
      <div className="mt-3 flex items-center gap-5">
        <PassRateDonut pass={pass} total={total} size={76} />
        <Legend total={total} ok={pass} notOk={fail} />
      </div>
    </Card>
  );
}
