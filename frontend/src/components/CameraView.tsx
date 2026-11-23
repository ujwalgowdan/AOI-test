import { Check, Loader2, Minus, Plus, TriangleAlert, X } from "lucide-react";

import { NativeSelect } from "@/components/ui/select";
import { type UseCameraResult, ZOOM_MAX, ZOOM_MIN } from "@/hooks/useCamera";
import type { ReadinessState } from "@/hooks/useReadinessProbe";
import { cn } from "@/lib/utils";

interface Props {
  camera: UseCameraResult;
  readiness?: ReadinessState;
  /** Toolbar rendered under the feed (capture / session controls). */
  children?: React.ReactNode;
  /** Small row under the toolbar, right-aligned (e.g. the chatbot launcher). */
  footer?: React.ReactNode;
}

const ZOOM_OPTIONS = Array.from({ length: ZOOM_MAX - ZOOM_MIN + 1 }, (_, i) => {
  const z = ZOOM_MIN + i;
  return { id: String(z), label: `${z}× zoom` };
});

const BRACKET = "absolute h-5 w-5 border-teal-400"; // teal-400 = #2dd4bf

export function CameraView({ camera, readiness, children, footer }: Props) {
  const { videoRef, ready, error, devices, deviceId, setDeviceId, zoom, setZoom, zoomIn, zoomOut } =
    camera;
  const live = ready && !error;

  return (
    <section
      aria-label="Inspection camera"
      className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2">
        <h2 className="text-sm font-semibold text-slate-800">Inspection camera</h2>
        <div className="flex items-center gap-2">
          <NativeSelect
            aria-label="Zoom"
            value={String(zoom)}
            onChange={(v) => setZoom(Number(v))}
            options={ZOOM_OPTIONS}
            className="h-8 w-28 text-xs"
          />
          {devices.length > 0 && (
            <NativeSelect
              aria-label="Camera source"
              value={deviceId ?? ""}
              onChange={setDeviceId}
              options={devices.map((d, i) => ({
                id: d.deviceId,
                label: d.label || `Camera ${i + 1}`,
              }))}
              className="h-8 w-48 text-xs"
            />
          )}
        </div>
      </div>

      {/* The overlay must share this box with <video>: useCamera.computeSourceRoi
          maps the same fractions through the video's rendered rect. */}
      <div className="relative min-h-[280px] flex-1 overflow-hidden bg-slate-950">
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
          <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> Live
          </span>
        )}

        {/* Detection badge. Driven by /api/detect/peek polling while a session is live. */}
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
                <Check className="h-3.5 w-3.5" /> Aligned -{" "}
                {readiness.detected.length ? readiness.detected.join(" + ") : "both wires"} detected
              </>
            ) : (
              <>
                <TriangleAlert className="h-3.5 w-3.5" /> NOT DETECTED - align both wires (green,
                yellow)
              </>
            )}
          </output>
        )}

        {/* Per-wire mini pills (informational only) from the same peek payload,
            mirroring the LIVE badge in the opposite corner. */}
        {live && readiness && readiness.status !== "idle" && (
          <WireChips detected={readiness.detected} expected={readiness.expected} />
        )}

        {live && (
          <div className="absolute bottom-3 right-3 flex gap-1">
            <ZoomButton onClick={zoomOut} disabled={zoom <= ZOOM_MIN} label="Zoom out (-)">
              <Minus className="h-4 w-4" />
            </ZoomButton>
            <ZoomButton onClick={zoomIn} disabled={zoom >= ZOOM_MAX} label="Zoom in (+)">
              <Plus className="h-4 w-4" />
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
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 px-4 py-2.5">
          {children}
        </div>
      )}
      {footer && <div className="flex justify-end px-4 pb-2.5">{footer}</div>}
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
      className="grid h-8 w-8 place-items-center rounded-md bg-black/60 text-white transition hover:bg-black/80 disabled:opacity-40"
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

function WireChips({ detected, expected }: { detected: string[]; expected: string[] }) {
  return (
    <ul aria-label="Wire detection" className="absolute right-3 top-3 flex gap-1.5">
      {expected.map((color) => {
        const found = detected.includes(color);
        const full = `${color.toUpperCase()} WIRE${found ? " - detected" : " - not found"}`;
        return (
          <li
            key={color}
            title={full}
            // Same inset, height and type as the LIVE badge; the border is
            // transparent when found so both states keep the same height.
            className={cn(
              "flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-bold uppercase tracking-wider",
              found
                ? cn("border-transparent", WIRE_FILL[color] ?? "bg-slate-600 text-white")
                : "border-dashed border-amber-400 bg-black/60 text-slate-200",
            )}
          >
            {found ? (
              <Check className="h-2.5 w-2.5" aria-hidden="true" />
            ) : (
              <X className="h-2.5 w-2.5 text-amber-400" aria-hidden="true" />
            )}
            <span aria-hidden="true">{color}</span>
            <span className="sr-only">{full}</span>
          </li>
        );
      })}
    </ul>
  );
}
