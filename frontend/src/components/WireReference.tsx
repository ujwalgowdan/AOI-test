import { WIRE_FILL } from "@/components/CameraView";
import { cn } from "@/lib/utils";

/** Expected wire order as the backend reports it (operator-left first), shown
 *  as a legend. Nothing is hard-coded: until the backend has reported an
 *  expected order (readiness check or a saved capture) it says so. */
export function WireReference({ expected }: { expected: string[] | undefined }) {
  const positions =
    expected?.length === 2 ? ["left", "right"] : (expected ?? []).map((_, i) => `#${i + 1}`);
  return (
    <section
      aria-label="Wire reference"
      className="rounded-lg border border-slate-200 bg-white px-3 py-2"
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        Wire reference
      </h2>
      {expected?.length ? (
        <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {expected.map((color, i) => (
            <li key={color} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn(
                  "h-2.5 w-6 rounded-full ring-1 ring-slate-300",
                  WIRE_FILL[color] ?? "bg-slate-500",
                )}
              />
              <span className="font-semibold capitalize text-slate-800">{color}</span>
              <span className="text-slate-500">{positions[i]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[11px] text-slate-500">
          Shown after the first camera check of a session.
        </p>
      )}
    </section>
  );
}
