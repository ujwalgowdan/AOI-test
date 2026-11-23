import { useQuery } from "@tanstack/react-query";
import { Camera, Play, Square } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { api } from "@/api/client";
import { CameraView } from "@/components/CameraView";
import { CaptureHistory } from "@/components/CaptureHistory";
import { ChatbotLauncher } from "@/components/ChatbotLauncher";
import { ContextBar } from "@/components/ContextBar";
import { DailySummary } from "@/components/DailySummary";
import { LastResultCard } from "@/components/LastResultCard";
import { SidebarSlot } from "@/components/Sidebar";
import { WireReference } from "@/components/WireReference";
import { Button } from "@/components/ui/button";
import { useCamera } from "@/hooks/useCamera";
import { useHotkey } from "@/hooks/useHotkey";
import { useReadinessProbe } from "@/hooks/useReadinessProbe";
import { useSessionSocket } from "@/hooks/useSessionSocket";
import { useCapturesStore } from "@/store/captures";
import { useSessionStore } from "@/store/session";

export default function Dashboard() {
  const camera = useCamera();
  const {
    session,
    setSession,
    applyLive,
    selectedEmployeeId,
    setSelectedEmployeeId,
    selectedInspectorId,
    setSelectedInspectorId,
  } = useSessionStore();
  const addCapture = useCapturesStore((s) => s.add);
  const lastExpected = useCapturesStore((s) => s.records[0]?.expected);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const employees = useQuery({ queryKey: ["employees"], queryFn: api.listEmployees });
  const inspectors = useQuery({ queryKey: ["inspectors"], queryFn: api.listInspectors });

  useSessionSocket(session?.id);

  const active = !!session?.active;

  // Live aligned / NOT DETECTED badge. Only polls /api/detect/peek while a
  // session is active (no backend traffic before START or after STOP) and is
  // paused during in-flight captures so the probe doesn't fight with /analyze
  // for the same camera frame.
  const readiness = useReadinessProbe(camera, { enabled: active && !busy });
  // Mirror the latest readiness into a ref so `capture` can gate on it without
  // taking `readiness` as a dependency — the probe updates every ~600ms and we
  // don't want to tear down / re-register the Space hotkey on every tick.
  const readinessRef = useRef(readiness);
  readinessRef.current = readiness;

  const start = useCallback(async () => {
    if (!selectedEmployeeId || !selectedInspectorId) {
      setError("Pick an operator and inspector first.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const s = await api.startSession(selectedEmployeeId, selectedInspectorId);
      setSession(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [selectedEmployeeId, selectedInspectorId, setSession]);

  const stop = useCallback(async () => {
    if (!session) return;
    setBusy(true);
    try {
      const s = await api.stopSession(session.id);
      setSession({ ...s, active: false });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [session, setSession]);

  const capture = useCallback(async () => {
    if (!session || !session.active) return;
    if (busy) return;
    // Block the capture (Space or the button) unless both wires are currently
    // detected. The backend enforces the same rule, but gating here means a
    // NOT DETECTED frame never even reaches /analyze.
    if (readinessRef.current.status !== "ready") {
      setError("Both wires (green, yellow) not detected — capture blocked.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const frame = await camera.grabFrame();
      if (!frame) {
        setError("Could not grab a frame from the camera.");
        return;
      }
      const r = await api.analyze(session.id, frame.blob, frame.roi);
      applyLive({
        ok_count: r.ok_count,
        not_ok_count: r.not_ok_count,
        last_result: r.result,
        last_image_url: r.image_url,
      });
      addCapture({
        sessionId: session.id,
        seq: r.ok_count + r.not_ok_count,
        at: new Date().toISOString(),
        result: r.result,
        imageUrl: r.image_url,
        detected: r.detected_order,
        expected: r.expected_order,
        operator: session.employee_name,
        inspector: session.inspector_name,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [session, camera, applyLive, addCapture, busy]);

  useHotkey("Space", capture, !!session?.active);
  // Legacy detector keyboard parity: + / - zoom the camera 1×–5×.
  // Always enabled (no need for an active session to zoom).
  useHotkey("+", camera.zoomIn);
  useHotkey("=", camera.zoomIn); // '+' on most keyboards is Shift+'=' — accept the unshifted key too.
  useHotkey("-", camera.zoomOut);

  const hint = error ? (
    <span className="font-medium text-rose-600" role="alert">
      {error}
    </span>
  ) : active && readiness.status === "not_detected" ? (
    <span className="font-medium text-rose-600">
      Align both wires (green, yellow) to enable capture.
    </span>
  ) : active ? (
    "Capture unlocks automatically once both wires sit inside the guide frame."
  ) : (
    "Capture unlocks after a session starts and both wires sit inside the guide frame."
  );

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <SidebarSlot name="setup">
        <ContextBar
          employees={employees.data ?? []}
          inspectors={inspectors.data ?? []}
          employeeId={selectedEmployeeId}
          inspectorId={selectedInspectorId}
          onEmployee={setSelectedEmployeeId}
          onInspector={setSelectedInspectorId}
          locked={active}
          camera={camera}
        />
      </SidebarSlot>
      <SidebarSlot name="wire">
        <WireReference expected={readiness.status === "idle" ? lastExpected : readiness.expected} />
      </SidebarSlot>

      <div className="grid flex-1 gap-4 p-4 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_400px]">
        <CameraView camera={camera} readiness={readiness} footer={<ChatbotLauncher />}>
          {!active && (
            <Button onClick={start} disabled={busy} variant="success" className="h-10 px-5">
              <Play className="h-4 w-4 fill-current" /> Start session
            </Button>
          )}
          <Button
            onClick={capture}
            disabled={!active || busy || readiness.status !== "ready"}
            className="h-10 min-w-36 px-5 font-bold tracking-wide"
            aria-keyshortcuts="Space"
          >
            <Camera className="h-4 w-4" />
            {busy && active ? "ANALYZING…" : "CAPTURE"}
            {active && (
              <kbd className="ml-1 rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">
                SPACE
              </kbd>
            )}
          </Button>
          <p className="min-w-0 flex-1 text-xs text-slate-500">{hint}</p>
          {active && (
            <Button
              onClick={stop}
              disabled={busy}
              variant="outline"
              className="h-10 border-fail/40 text-fail hover:bg-red-50"
            >
              <Square className="h-3.5 w-3.5 fill-current" /> End session
            </Button>
          )}
        </CameraView>

        <aside aria-label="Results" className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto">
          <LastResultCard />
          <DailySummary />
          <CaptureHistory />
        </aside>
      </div>
    </div>
  );
}
