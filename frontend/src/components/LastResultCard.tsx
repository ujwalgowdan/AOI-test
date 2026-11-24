import { CircleCheck, CircleX, ImageOff } from "lucide-react";

import { withStationToken } from "@/api/client";
import { Eyebrow } from "@/components/console";
import { Card } from "@/components/ui/card";
import { captureReason, clockTime } from "@/lib/console";
import { cn } from "@/lib/utils";
import { useCapturesStore } from "@/store/captures";
import { useSessionStore } from "@/store/session";

export function LastResultCard() {
  const session = useSessionStore((s) => s.session);
  const records = useCapturesStore((s) => s.records);
  const result = session?.last_result;
  const url = withStationToken(session?.last_image_url);
  // Details (reason, time) come from this browser's /analyze response; a WS
  // update from elsewhere only carries the verdict + image.
  const rec = records.find((r) => r.sessionId === session?.id && r.imageUrl === url);

  return (
    <Card className="rounded-xl p-4">
      <Eyebrow>Last capture</Eyebrow>
      {!result ? (
        <div className="py-6 text-center text-xs text-[var(--faint)]">
          No capture yet.
          <br />
          Start a session and capture the first piece.
        </div>
      ) : (
        <div className="mt-2.5 flex gap-3">
          <div
            className={cn(
              "relative aspect-[4/3] w-32 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-900",
              result === "OK"
                ? "border-pass"
                : result === "NOT OK"
                  ? "border-fail"
                  : "border-[var(--line-strong)]",
            )}
          >
            {url ? (
              <a href={url} target="_blank" rel="noreferrer" title="Open full image">
                <img src={url} alt="Last capture" className="h-full w-full object-cover" />
              </a>
            ) : (
              <ImageOff className="m-auto mt-8 h-6 w-6 text-[var(--faint)]" />
            )}
            {rec && (
              <span
                className={cn(
                  "absolute bottom-1 left-1 rounded px-1.5 text-[10px] font-bold text-white",
                  result === "OK" ? "bg-pass" : "bg-fail",
                )}
              >
                #{rec.seq}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div
              className={cn(
                "flex items-center gap-1.5 text-2xl font-extrabold leading-tight",
                result === "OK" && "text-pass",
                result === "NOT OK" && "text-fail",
                result !== "OK" && result !== "NOT OK" && "text-[var(--ink2)]",
              )}
            >
              {result === "OK" ? (
                <CircleCheck className="h-6 w-6 shrink-0" />
              ) : (
                <CircleX className="h-6 w-6 shrink-0" />
              )}
              {result}
            </div>
            {rec && (
              <>
                <p className="mt-1 text-xs font-medium text-[var(--ink2)]">
                  {captureReason(rec.result, rec.detected, rec.expected)}
                </p>
                <p className="mt-1 text-[11px] text-[var(--faint)]">
                  {clockTime(new Date(rec.at))} · {rec.operator} · {rec.inspector}
                </p>
              </>
            )}
            {!rec && session && (
              <p className="mt-1 text-[11px] text-[var(--faint)]">
                {session.employee_name} · {session.inspector_name}
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
