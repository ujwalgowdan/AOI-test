import { Check, Loader2, Minus, Plus, TriangleAlert } from "lucide-react";

import { type UseCameraResult, ZOOM_LEVELS } from "@/hooks/useCamera";
import type { ReadinessState } from "@/hooks/useReadinessProbe";
import { cn } from "@/lib/utils";

interface Props {
  camera: UseCameraResult;
  readiness?: ReadinessState;
  /** Toolbar rendered under the feed (capture / session controls). */
  children?: React.ReactNode;
}

const BRACKET = "absolute h-5 w-5 border-teal-400"; // teal-400 = #2dd4bf

export function CameraView({ camera, readiness, children }: Props) {
  const { videoRef, ready, error, zoom, setZoom, zoomIn, zoomOut } = camera;
  const live = ready && !error;

  return (
    <section
      aria-label="Inspection camera"
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
      style={{ minHeight: 280 }}
    >
      <div
        className="flex flex-wrap items-center gap-2 border-b px-3 py-2"
        style={{ borderColor: "var(--line)" }}
      >
        <button
          type="button"
          aria-label={`Zoom ${zoom}×, click to switch to ${zoom === 3 ? 1 : 3}×`}
          onClick={() => setZoom(zoom === 3 ? 1 : 3)}
          className="h-8 rounded-md border px-3 text-xs font-semibold"
          style={{
            background: zoom === 3 ? "var(--orange)" : "var(--blue)",
            borderColor: zoom === 3 ? "var(--orange)" : "var(--blue)",
            color: zoom === 3 ? "var(--orange-ink)" : "var(--blue-ink)",
          }}
        >
          Zoom {zoom}×
        </button>
        <span className="text-[11px] txf">Space to capture</span>
      </div>

      {/* The overlay must share this box with <video>: useCamera.computeSourceRoi
          maps the same fractions through the video's rendered rect. */}
      <div
        className="relative min-h-[280px] flex-1 overflow-hidden"
        style={{ background: "var(--feed)" }}
      >
        {/* CSS scale must match the canvas-side crop applied in
            useCamera.grabFrame so the preview equals what /analyze sees. */}
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-150"
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
          playsInline
          muted
          autoPlay
        />

        {/* Alignment guide — same rect as before (left 1/3, top 37.5%,
            1/3 × 1/4), drawn as teal corner brackets. */}
        {live && (
          <div
            className="pointer-events-none absolute left-1/3 top-[37.5%] h-1/4 w-1/3"
            aria-hidden="true"
          >
            <span
              className={cn(BRACKET, "left-0 top-0 rounded-tl-md border-l-[3px] border-t-[3px]")}
            />
            <span
              className={cn(BRACKET, "right-0 top-0 rounded-tr-md border-r-[3px] border-t-[3px]")}
            />
            <span
              className={cn(BRACKET, "bottom-0 left-0 rounded-bl-md border-b-[3px] border-l-[3px]")}
            />
            <span
              className={cn(
                BRACKET,
                "bottom-0 right-0 rounded-br-md border-b-[3px] border-r-[3px]",
              )}
            />
          </div>
        )}

        {live && (
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-red-600/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /> Live
          </span>
        )}

        {/* YELLOW / GREEN wire pills, top right: only the detected wire lights up. */}
        {live && readiness && readiness.status !== "idle" && (
          <WirePills detected={readiness.detected} expected={readiness.expected} />
        )}

        {/* Detection note, bottom centre: DETECTED only when both wires are in. */}
        {live && readiness && readiness.status !== "idle" && (
          <output
            className={cn(
              "absolute bottom-14 left-1/2 flex -translate-x-1/2 md:bottom-4 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg",
              readiness.status === "ready" ? "bg-emerald-600" : "bg-rose-600",
            )}
            aria-live="polite"
          >
            {readiness.status === "ready" ? (
              <>
                <Check className="h-3.5 w-3.5" /> DETECTED - both wires aligned
              </>
            ) : (
              <>
                <TriangleAlert className="h-3.5 w-3.5" /> NOT DETECTED - align both wires (green,
                yellow)
              </>
            )}
          </output>
        )}

        {live && (
          <div className="absolute bottom-3 right-3 flex flex-row gap-1.5">
            <ZoomButton onClick={zoomIn} disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]} label="Zoom in (+)">
              <Plus className="h-3.5 w-3.5" />
            </ZoomButton>
            <ZoomButton onClick={zoomOut} disabled={zoom <= ZOOM_LEVELS[0]} label="Zoom out (-)">
              <Minus className="h-3.5 w-3.5" />
            </ZoomButton>
          </div>
        )}

        {!ready && !error && (
          <div className="absolute inset-0 grid place-items-center text-sm text-slate-300">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              Acquiring camera…
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-black/70 p-4 text-center text-sm text-red-200">
            <div>
              <div className="font-semibold">Camera unavailable</div>
              <div className="mt-1 text-xs">{error}</div>
              <div className="mt-2 text-xs text-slate-300">
                On non-localhost deployments the browser only grants <code>getUserMedia</code> over
                HTTPS.
              </div>
            </div>
          </div>
        )}
      </div>

      {children && (
        <div
          className="flex flex-wrap items-center gap-3 border-t px-3 py-2.5"
          style={{ borderColor: "var(--line)" }}
        >
          {children}
        </div>
      )}
    </section>
  );
}

function ZoomButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-6 w-6 place-items-center rounded-md bg-white/15 font-bold text-white transition hover:bg-white/25 disabled:opacity-40"
    >
      {children}
    </button>
  );
}

// Fill colours for known wire colours; anything else falls back to slate.
export const WIRE_FILL: Record<string, string> = {
  green: "bg-emerald-600 text-white",
  yellow: "bg-yellow-400 text-slate-900",
  red: "bg-red-600 text-white",
  blue: "bg-blue-600 text-white",
  black: "bg-slate-800 text-white",
  white: "bg-white text-slate-900",
};

const WIRE_DOT: Record<string, string> = {
  yellow: "bg-yellow-300",
  green: "bg-emerald-400",
  red: "bg-red-400",
  blue: "bg-blue-400",
};

/** One pill per expected wire, top right of the feed. The detected wire's pill
 *  lights up in its colour; the other stays dim. */
function WirePills({ detected, expected }: { detected: string[]; expected: string[] }) {
  return (
    <ul aria-label="Wire detection" className="absolute right-3 top-3 flex gap-1.5">
      {expected.map((color) => {
        const found = detected.includes(color);
        const full = `${color.toUpperCase()} WIRE${found ? " - detected" : " - not found"}`;
        return (
          <li
            key={color}
            title={full}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider transition",
              found
                ? color === "yellow"
                  ? "border-yellow-300/70 bg-yellow-300/15 text-yellow-300"
                  : color === "green"
                    ? "border-emerald-400/70 bg-emerald-400/15 text-emerald-300"
                    : "border-white/60 bg-white/15 text-white"
                : "border-white/20 bg-white/5 text-white/40",
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                found ? cn(WIRE_DOT[color] ?? "bg-white", "shadow-[0_0_6px_currentColor]") : "bg-current opacity-40",
              )}
            />
            <span aria-hidden="true">{color}</span>
            <span className="sr-only">{full}</span>
          </li>
        );
      })}
    </ul>
  );
}
