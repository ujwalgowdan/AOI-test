import { initials, passRate } from "@/lib/console";
import { cn } from "@/lib/utils";

/** Small uppercase eyebrow used as the title of rail cards. */
export function Eyebrow({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("text-[11px] font-semibold uppercase tracking-wider text-slate-500", className)}
      {...props}
    />
  );
}

/** Ring chart: green arc = pass share, red remainder = fail share. */
export function PassRateDonut({
  pass,
  total,
  size = 72,
}: {
  pass: number;
  total: number;
  size?: number;
}) {
  const rate = passRate(pass, total);
  // r = 15.9155 gives a circumference of 100, so the dash length is the percent.
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          strokeWidth="3.5"
          className={rate === null ? "stroke-slate-200" : "stroke-fail"}
        />
        {rate !== null && (
          <circle
            cx="18"
            cy="18"
            r="15.9155"
            fill="none"
            strokeWidth="3.5"
            strokeDasharray={`${rate} ${100 - rate}`}
            className="stroke-pass transition-[stroke-dasharray] duration-500"
          />
        )}
      </svg>
      <div className="absolute inset-[18%] grid place-items-center overflow-hidden text-center leading-none">
        <div>
          <div
            className={cn(
              "font-bold tabular-nums",
              size >= 72 ? "text-base" : "text-sm",
              rate === null ? "text-slate-400" : "text-pass",
            )}
          >
            {rate === null ? "–%" : `${rate}%`}
          </div>
          <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-400">
            Pass rate
          </div>
        </div>
      </div>
      <span className="sr-only">Pass rate {rate === null ? "not available" : `${rate}%`}</span>
    </div>
  );
}

export function ResultPill({ result, className }: { result: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        result === "OK" && "bg-pass/15 text-emerald-700",
        result === "NOT OK" && "bg-fail/15 text-red-700",
        result !== "OK" && result !== "NOT OK" && "bg-slate-200 text-slate-600",
        className,
      )}
    >
      {result}
    </span>
  );
}

export function Avatar({ name, tone = "blue" }: { name: string; tone?: "blue" | "amber" }) {
  return (
    <span
      className={cn(
        "grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10px] font-bold",
        tone === "blue" ? "bg-innotech/10 text-innotech" : "bg-amber-100 text-amber-700",
      )}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
