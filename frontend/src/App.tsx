import { Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { elapsed } from "@/lib/console";
import { playVerdict, unlockAudio } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/session";
import { useSoundStore } from "@/store/sound";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SidebarLayout } from "./components/Sidebar";
import Dashboard from "./routes/Dashboard";
import Reports from "./routes/Reports";
import Settings from "./routes/Settings";

export default function App() {
  const { adminToken, setAdminToken } = useSessionStore();
  useVerdictSound();
  return (
    <div className="flex h-full flex-col bg-slate-100">
      <header className="z-10 grid shrink-0 grid-cols-[1fr_auto] items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src="/innotech-logo.png"
            alt="Innotech Integration"
            className="h-9 w-auto rounded-md border border-slate-200 bg-white p-0.5"
          />
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-sm font-bold text-slate-900">Innotech AOI</h1>
            <div className="truncate text-[11px] text-slate-500">Automated Optical Inspection</div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <SoundToggle />
          <SessionChip />
        </div>
      </header>

      {/* Navigation lives in the left sidebar (Dashboard · Reports · Admin). */}
      <SidebarLayout>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </ErrorBoundary>
      </SidebarLayout>

      <footer className="flex shrink-0 items-center justify-between border-t border-slate-200 bg-white px-4 py-1.5 text-[11px] text-slate-500">
        <span>AOI Tester - MKII</span>
        {adminToken && (
          <button
            type="button"
            className="hover:text-slate-800 hover:underline"
            onClick={() => setAdminToken(null)}
          >
            Sign out (admin)
          </button>
        )}
      </footer>
      <Toaster position="top-right" richColors closeButton />
    </div>
  );
}

function SessionChip() {
  const session = useSessionStore((s) => s.session);
  const active = !!session?.active;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active || !session) {
    return (
      <span className="whitespace-nowrap rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        No active session
      </span>
    );
  }
  return (
    <output className="flex items-center gap-2 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      Session live ·{" "}
      <span className="tabular-nums">{elapsed(now - Date.parse(session.start_time))}</span>
    </output>
  );
}

/** Beep on every new capture verdict — the same store update that refreshes
 *  LAST CAPTURE (from /analyze or the session socket). Lives in App so it
 *  survives Dashboard re-mounts. */
function useVerdictSound() {
  useEffect(() => {
    // Browsers only let audio start after a user gesture: unlock on the first one.
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    const unsub = useSessionStore.subscribe((state, prev) => {
      const now = state.session;
      const before = prev.session;
      // Same session, new image = a new capture. A WS echo of the same
      // capture carries the same URL, so it doesn't beep twice.
      if (!now || now.id !== before?.id || !now.last_image_url) return;
      if (now.last_image_url === before.last_image_url) return;
      if (useSoundStore.getState().soundOn) playVerdict(now.last_result);
    });
    return () => {
      unsub();
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);
}

function SoundToggle() {
  const { soundOn, toggle } = useSoundStore();
  const label = soundOn ? "Sound on" : "Sound off";
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label="Verdict sound"
      aria-pressed={soundOn}
      className={cn(
        "grid h-8 w-8 place-items-center rounded-full transition hover:bg-slate-100",
        soundOn ? "text-innotech" : "text-slate-400",
      )}
    >
      {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </button>
  );
}
