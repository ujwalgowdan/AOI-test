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
      className="rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2"
    >
      <details>
        <summary className="cursor-pointer select-none text-xs font-semibold text-[var(--ink2)]">
          Wire reference
        </summary>
        {expected?.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {expected.map((color, i) => (
              <li key={color} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-2.5 w-6 rounded-full ring-1 ring-[var(--line-strong)]",
                    WIRE_FILL[color] ?? "bg-[var(--faint)]",
                  )}
                />
                <span className="font-semibold capitalize text-[var(--ink)]">{color}</span>
                <span className="text-[var(--faint)]">{positions[i]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-[var(--faint)]">
            Shown after the first camera check of a session.
          </p>
        )}
      </details>
    </section>
  );
}
