import { useQuery } from "@tanstack/react-query";
import { Camera, Play, Square } from "lucide-react";
import { useCallback, useRef, useState } from "react";

import { api } from "@/api/client";
import { AssistantPanel } from "@/components/AssistantPanel";
import { CameraView } from "@/components/CameraView";
import { CaptureHistory } from "@/components/CaptureHistory";
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
import { STATION } from "@/lib/console";
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
    selectedUnit,
    setSelectedUnit,
  } = useSessionStore();
  const addCapture = useCapturesStore((s) => s.add);
  const lastExpected = useCapturesStore((s) => s.records[0]?.expected);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Enlarged assistant: the camera swaps to a slim bar so the chat gets the pane.
  const [chatBig, setChatBig] = useState(false);

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
  // Legacy detector keyboard parity: + / - zoom the camera between 1× and 3×.
  // Always enabled (no need for an active session to zoom).
  useHotkey("+", camera.zoomIn);
  useHotkey("=", camera.zoomIn); // '+' on most keyboards is Shift+'=' — accept the unshifted key too.
  useHotkey("-", camera.zoomOut);

  const today = new Date().toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const todayLong = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const setupDone = active || (!!selectedEmployeeId && !!selectedInspectorId);
  const operatorName =
    session?.employee_name ?? employees.data?.find((e) => e.id === selectedEmployeeId)?.name;
  const inspectorName =
    session?.inspector_name ?? inspectors.data?.find((i) => i.id === selectedInspectorId)?.name;
  const cameraLabel =
    camera.devices
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` }))
      .find((c) => c.id === camera.deviceId)?.label ?? "Default camera";

  const hint = error ? (
    <span className="font-medium text-fail" role="alert">
      {error}
    </span>
  ) : active && readiness.status === "not_detected" ? (
    <span className="font-medium text-fail">Align both wires (green, yellow) to enable capture.</span>
  ) : active ? (
    "Verdict and wire order are checked on capture"
  ) : (
    "Space to capture · unlocks after a session starts and both wires sit inside the guide frame."
  );

  return (
    <div className="flex min-h-full flex-col lg:h-full">
      <SidebarSlot name="start">
        {!active && (
          <Button
            onClick={start}
            disabled={busy}
            className="h-[38px] w-full text-sm font-bold"
          >
            <Play className="h-4 w-4 fill-current" /> Start session
          </Button>
        )}
      </SidebarSlot>
      <SidebarSlot name="setup">
        <ContextBar
          employees={employees.data ?? []}
          inspectors={inspectors.data ?? []}
          employeeId={selectedEmployeeId}
          inspectorId={selectedInspectorId}
          onEmployee={setSelectedEmployeeId}
          onInspector={setSelectedInspectorId}
          unit={selectedUnit}
          onUnit={setSelectedUnit}
          locked={active}
          camera={camera}
        />
      </SidebarSlot>
      <SidebarSlot name="wire">
        {/* After setup is done the collapsed setup card's info lives here, on
            the Live inspection card, above the wire reference. */}
        {setupDone && (
          <div className="subs mb-2">
            {operatorName && (
              <span className="sub-row">
                <span className="sd" />
                Operator: {operatorName}
                <span className="tk">✓</span>
              </span>
            )}
            {inspectorName && (
              <span className="sub-row">
                <span className="sd" />
                Inspector: {inspectorName}
                <span className="tk">✓</span>
              </span>
            )}
            <span className="sub-row">
              <span className="sd" />
              {STATION.shift} · {STATION.line} · {todayLong}
            </span>
            <span className="sub-row">
              <span className="sd" />
              Camera: {cameraLabel}
            </span>
            <span className="sub-row">
              <span className="sd" />
              Unit {selectedUnit}
            </span>
          </div>
        )}
        <WireReference expected={readiness.status === "idle" ? lastExpected : readiness.expected} />
      </SidebarSlot>

      <div className="grid flex-1 gap-3 p-3 lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Middle pane: camera on top (70), BuLLM Assistant below (30). */}
        <section className="pane" aria-label="Inspection">
          <div className="pane-h">
            <span className="picon">◆</span>Inspection camera
            <span className="rt">
              {STATION.line} · {STATION.shift} · {today}
            </span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
            {chatBig ? (
              <button
                type="button"
                onClick={() => setChatBig(false)}
                className="mb-2 flex flex-none items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold tx2"
                style={{ borderColor: "var(--line)", background: "var(--soft2)" }}
              >
                ▸ Camera feed (minimized) · Zoom {camera.zoom}× · Space to capture
              </button>
            ) : (
            <div className="flex min-h-0 flex-[7_1_0] flex-col">
            <CameraView camera={camera} readiness={readiness}>
              <Button
                onClick={capture}
                disabled={!active || busy || readiness.status !== "ready"}
                className="h-9 min-w-36 bg-innotech px-5 font-extrabold tracking-wide text-white hover:bg-innotech-dark"
                aria-keyshortcuts="Space"
              >
                <Camera className="h-4 w-4" />
                {busy && active ? "ANALYZING…" : "CAPTURE"}
                {active && (
                  <kbd className="ml-1 rounded bg-white/25 px-1.5 py-0.5 text-[10px] font-semibold">
                    SPACE
                  </kbd>
                )}
              </Button>
              <p className="min-w-0 flex-1 text-xs txf">{hint}</p>

            </CameraView>
            </div>
            )}
            <AssistantPanel big={chatBig} onToggleBig={() => setChatBig((b) => !b)} />
          </div>
        </section>

        {/* Right pane: verdicts and today's output. */}
        <section className="pane" aria-label="Output">
          <div className="pane-h">
            <span className="picon">⚡</span>Output
            <span className="rt">Live inspection - Verdict</span>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            <LastResultCard />
            <DailySummary />
            <CaptureHistory />
            {active && (
              <Button
                onClick={stop}
                disabled={busy}
                variant="outline"
                className="w-full flex-none border-fail/40 text-fail hover:bg-[var(--red-fill)]"
              >
                <Square className="h-3.5 w-3.5 fill-current" /> End session
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
