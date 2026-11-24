import { useCallback, useEffect, useRef, useState } from "react";

export interface SourceRoi {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CapturedFrame {
  blob: Blob;
  roi: SourceRoi;
}

export interface UseCameraResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  ready: boolean;
  error: string | null;
  grabFrame: () => Promise<CapturedFrame | null>;
  devices: MediaDeviceInfo[];
  deviceId: string | null;
  setDeviceId: (id: string) => void;
  zoom: number;
  setZoom: (z: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 3;
// Only 1x and 3x are offered (default 1x), per the station's UI spec.
export const ZOOM_LEVELS = [1, 3] as const;

// Cyan / blue alignment guide fractions. Must mirror `CameraView.tsx`
// (`left-1/3 top-[37.5%] w-1/3 h-1/4`) — the backend detector keeps the
// same defaults in `detector_core.DEFAULT_ROI_FRAC`.
const ROI_FRAC = { x: 1 / 3, y: 0.375, w: 1 / 3, h: 0.25 } as const;

// Map the on-screen overlay rect into source-video coordinates the backend
// can use directly. The `<video>` element renders with `object-cover`, so
// one dimension is scaled to fill and the other is cropped equally on both
// sides; this inverts that transform.
export function computeSourceRoi(
  videoW: number,
  videoH: number,
  displayW: number,
  displayH: number,
): SourceRoi | null {
  if (videoW <= 0 || videoH <= 0 || displayW <= 0 || displayH <= 0) return null;
  const scale = Math.max(displayW / videoW, displayH / videoH);
  const visibleSrcW = displayW / scale;
  const visibleSrcH = displayH / scale;
  const srcX0 = (videoW - visibleSrcW) / 2;
  const srcY0 = (videoH - visibleSrcH) / 2;
  const x = Math.max(0, Math.round(srcX0 + ROI_FRAC.x * visibleSrcW));
  const y = Math.max(0, Math.round(srcY0 + ROI_FRAC.y * visibleSrcH));
  const w = Math.max(1, Math.min(videoW - x, Math.round(ROI_FRAC.w * visibleSrcW)));
  const h = Math.max(1, Math.min(videoH - y, Math.round(ROI_FRAC.h * visibleSrcH)));
  return { x, y, w, h };
}

// Labels suggesting a real built-in webcam, in rough order of preference.
const WEBCAM_PATTERNS = [
  /integrated/i,
  /built[- ]?in/i,
  /facetime/i,
  /hd (web)?cam/i,
  /\bwebcam\b/i,
];

// Labels suggesting a virtual / non-physical camera; avoid as default.
const VIRTUAL_PATTERNS = [
  /\bobs\b/i,
  /virtual/i,
  /manycam/i,
  /\bsnap\b/i,
  /xsplit/i,
  /\bvcam\b/i,
  /v4l2 ?loopback/i,
  /ip ?cam/i,
];

function looksLikeWebcam(label: string): boolean {
  return WEBCAM_PATTERNS.some((re) => re.test(label));
}

function looksVirtual(label: string): boolean {
  return VIRTUAL_PATTERNS.some((re) => re.test(label));
}

/**
 * Pick the device that most resembles a built-in webcam.
 * 1. Prefer the active device if it already looks like a real webcam.
 * 2. Else prefer the first device matching WEBCAM_PATTERNS.
 * 3. Else prefer the first device that does NOT match VIRTUAL_PATTERNS.
 * 4. Else fall back to whatever is active (or the first device, or null).
 */
function pickPreferred(
  cams: MediaDeviceInfo[],
  activeDeviceId: string | null,
): MediaDeviceInfo | null {
  if (cams.length === 0) return null;
  const active = cams.find((c) => c.deviceId === activeDeviceId);
  if (active && looksLikeWebcam(active.label)) return active;
  const webcam = cams.find((c) => looksLikeWebcam(c.label));
  if (webcam) return webcam;
  if (active && !looksVirtual(active.label)) return active;
  const nonVirtual = cams.find((c) => !looksVirtual(c.label));
  if (nonVirtual) return nonVirtual;
  return active ?? cams[0] ?? null;
}

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // One reusable canvas for grabFrame. The readiness probe calls grabFrame
  // ~once a second; allocating a fresh full-resolution canvas (and its
  // multi-MB backing buffer) each time churned the GC and made the preview
  // stutter. Reuse a single element and just re-set its size per frame.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const userPickedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceIdState] = useState<string | null>(null);
  // Digital zoom factor (1 = no zoom, 3 = 3×). Mirrors the legacy detector's
  // ZOOM_LEVEL: at zoom=N we crop the centre 1/N × 1/N of the source frame
  // and scale it back to full resolution, so both the live preview AND the
  // frame shipped to /analyze show the zoomed view.
  const [zoom, setZoomState] = useState<number>(1);
  const zoomRef = useRef<number>(1);
  zoomRef.current = zoom;

  const setZoom = useCallback((z: number) => {
    // Snap to the nearest offered level (1x or 3x).
    const nearest = ZOOM_LEVELS.reduce((a, b) =>
      Math.abs(b - z) < Math.abs(a - z) ? b : a,
    );
    setZoomState(nearest);
  }, []);
  const zoomIn = useCallback(() => {
    const next = ZOOM_LEVELS.find((z) => z > zoomRef.current);
    if (next !== undefined) setZoom(next);
  }, [setZoom]);
  const zoomOut = useCallback(() => {
    const prev = [...ZOOM_LEVELS].reverse().find((z) => z < zoomRef.current);
    if (prev !== undefined) setZoom(prev);
  }, [setZoom]);

  // Wrapping setDeviceId lets us record that the change came from the UI
  // (the picker in CameraView) and therefore the preference heuristic should
  // not override it on the next enumeration pass.
  const setDeviceId = useCallback((id: string) => {
    userPickedRef.current = true;
    setDeviceIdState(id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    setError(null);

    (async () => {
      try {
        const constraints: MediaStreamConstraints = {
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: "user" },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }

        // Learn which device the browser actually opened, so we can avoid
        // re-selecting if it already matches the preference.
        const track = stream.getVideoTracks()[0];
        const activeDeviceId = track?.getSettings().deviceId ?? null;

        const cams = (await navigator.mediaDevices.enumerateDevices()).filter(
          (d) => d.kind === "videoinput",
        );
        setDevices(cams);

        // Only run the preference heuristic on the first acquisition, and
        // only if the user hasn't manually picked a device yet.
        if (!deviceId && !userPickedRef.current) {
          const preferred = pickPreferred(cams, activeDeviceId);
          if (preferred && preferred.deviceId !== activeDeviceId) {
            // Trigger a single re-acquisition on the preferred device. The
            // useEffect dep on `deviceId` re-runs; the user-picked flag stays
            // false because we did not go through setDeviceId.
            setDeviceIdState(preferred.deviceId);
          } else if (activeDeviceId) {
            // Lock state to what is actually streaming so the picker shows
            // the right selected option.
            setDeviceIdState(activeDeviceId);
          }
        }

        setReady(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setReady(false);
      }
    })();

    return () => {
      cancelled = true;
      const s = streamRef.current;
      if (s) for (const t of s.getTracks()) t.stop();
      streamRef.current = null;
    };
  }, [deviceId]);

  const grabFrame = useCallback(async (): Promise<CapturedFrame | null> => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const rect = video.getBoundingClientRect();
    const roi = computeSourceRoi(video.videoWidth, video.videoHeight, rect.width, rect.height);
    if (!roi) return null;
    if (!canvasRef.current) canvasRef.current = document.createElement("canvas");
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // At zoom=N, crop the centre 1/N × 1/N of the source video and stretch
    // it to fill the canvas. The on-screen preview applies the same
    // transform via CSS, so the operator and the backend see the same
    // pixels. ROI fractions stay constant relative to the (zoomed) frame,
    // so `computeSourceRoi` doesn't need to change.
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoomRef.current));
    if (z > 1) {
      const sw = video.videoWidth / z;
      const sh = video.videoHeight / z;
      const sx = (video.videoWidth - sw) / 2;
      const sy = (video.videoHeight - sh) / 2;
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
    );
    if (!blob) return null;
    return { blob, roi };
  }, []);

  return {
    videoRef,
    ready,
    error,
    grabFrame,
    devices,
    deviceId,
    setDeviceId,
    zoom,
    setZoom,
    zoomIn,
    zoomOut,
  };
}
