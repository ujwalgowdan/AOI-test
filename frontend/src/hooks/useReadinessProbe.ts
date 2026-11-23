import { useEffect, useRef, useState } from "react";

import { api } from "@/api/client";
import type { UseCameraResult } from "@/hooks/useCamera";

export type ReadinessState =
  | { status: "idle" } // camera not yet ready, or paused (busy/hidden tab)
  | { status: "ready"; detected: string[]; expected: string[] }
  | { status: "not_detected"; detected: string[]; expected: string[] };

interface Options {
  enabled: boolean;
  intervalMs?: number;
}

/**
 * Lightweight polling of `/api/detect/peek` so the camera card can show
 * READY vs. NOT DETECTED before the operator presses Space. The probe
 * uses the same `grabFrame` path as the real capture, so what the badge
 * reports matches what `/analyze` will see if the operator commits.
 *
 * Polling is paused while `enabled` is false (e.g. during an in-flight
 * capture) and while the tab is hidden, so we don't burn CPU or hammer
 * the backend off-screen.
 */
export function useReadinessProbe(
  camera: UseCameraResult,
  { enabled, intervalMs = 800 }: Options,
): ReadinessState {
  const [state, setState] = useState<ReadinessState>({ status: "idle" });
  const inFlightRef = useRef<AbortController | null>(null);
  // Depend on these stable parts, not `camera`: useCamera returns a new
  // object every render, which restarted the effect after each response.
  const { grabFrame, ready, error } = camera;

  useEffect(() => {
    if (!enabled || !ready || error) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      if (document.hidden) return;
      // Drop overlapping requests rather than queuing them.
      if (inFlightRef.current) return;

      const frame = await grabFrame();
      if (!frame || cancelled) return;

      const controller = new AbortController();
      inFlightRef.current = controller;
      try {
        const r = await api.peek(frame.blob, frame.roi, controller.signal);
        if (cancelled) return;
        setState(
          r.ready
            ? { status: "ready", detected: r.detected, expected: r.expected }
            : { status: "not_detected", detected: r.detected, expected: r.expected },
        );
      } catch {
        // Transient errors (proxy hiccups, network) just keep the last
        // state — don't flash a misleading badge.
      } finally {
        if (inFlightRef.current === controller) inFlightRef.current = null;
      }
    };

    const id = window.setInterval(tick, intervalMs);
    // Kick off immediately so the badge appears without waiting one tick.
    void tick();

    return () => {
      cancelled = true;
      window.clearInterval(id);
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, [enabled, ready, error, grabFrame, intervalMs]);

  return state;
}
