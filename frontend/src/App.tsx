import { Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";

import { elapsed, initials } from "@/lib/console";
import { playVerdict, unlockAudio } from "@/lib/sound";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/session";
import { useSoundStore } from "@/store/sound";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { isAuthed } from "./features/login/auth";
import { LoginPage } from "./features/login/LoginPage";
import { SidebarLayout } from "./components/Sidebar";
import Dashboard from "./routes/Dashboard";
import Reports from "./routes/Reports";
import Settings from "./routes/Settings";
import SpcChart from "./routes/SpcChart";

export default function App() {
  const { adminToken, setAdminToken } = useSessionStore();
  useVerdictSound();
  // Hosted deployment is gated behind the fixed operator login.
  const [authed, setAuthed] = useState(isAuthed);
  if (!authed) return <LoginPage onLogin={() => setAuthed(true)} />;
  return (
    <div className="flex h-full flex-col" style={{ background: "var(--bg)" }}>
      <header
        className="z-10 grid shrink-0 grid-cols-[1fr_auto] items-center gap-3 border-b px-4 py-2"
        style={{ background: "var(--card)", borderColor: "var(--line)" }}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src="/innotech-logo.png"
            alt="Innotech Integration"
            className="h-9 w-auto rounded-md border p-0.5"
            style={{ borderColor: "var(--line)", background: "var(--card)" }}
          />
          <div className="min-w-0 leading-tight">
            <h1 className="truncate text-sm font-bold tx">Innotech AOI</h1>
            <div className="truncate text-[11px] tx2">Automated Optical Inspection</div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <SoundToggle />
          <SessionChip />
          <ThemeToggle />
          <HeaderAvatar />
        </div>
      </header>

      {/* Navigation lives in the left station rail. */}
      <SidebarLayout>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/quality/spc" element={<SpcChart />} />
          </Routes>
        </ErrorBoundary>
      </SidebarLayout>

      <footer
        className="flex shrink-0 items-center justify-between border-t px-4 py-1.5 text-[11px] txf"
        style={{ background: "var(--card)", borderColor: "var(--line)" }}
      >
        <span>AOI Tester - MKII</span>
        <span className="flex items-center gap-3">
          {adminToken && (
            <button
              type="button"
              className="hover:text-[var(--ink)] hover:underline"
              onClick={() => setAdminToken(null)}
            >
              Sign out (admin)
            </button>
          )}
          <span>Innotech Integration</span>
        </span>
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
      <span
        className="whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide txf"
        style={{ borderColor: "var(--line-strong)", background: "var(--soft2)" }}
      >
        No active session
      </span>
    );
  }
  return (
    <output
      className="flex items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide"
      style={{
        borderColor: "var(--line-strong)",
        background: "var(--soft2)",
        color: "var(--ink2)",
      }}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pass opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-pass" />
      </span>
      Session live ·{" "}
      <span className="tabular-nums">{elapsed(now - Date.parse(session.start_time))}</span>
    </output>
  );
}

/** Light / dark toggle. Stored on this device (aoi-theme); index.html applies
 *  it before first paint. */
function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    document.documentElement.dataset.theme === "dark" ? "dark" : "light",
  );
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("aoi-theme", next);
    } catch {
      // private mode: theme just resets next visit
    }
  };
  const label = theme === "dark" ? "Light theme" : "Dark theme";
  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      className="grid h-8 w-8 place-items-center rounded-lg border transition hover:bg-[var(--soft)]"
      style={{ borderColor: "var(--line)", background: "var(--soft2)", color: "var(--ink2)" }}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

/** Operator initials while a session is live, AD for a signed-in admin. */
function HeaderAvatar() {
  const operator = useSessionStore((s) => (s.session?.active ? s.session.employee_name : null));
  const admin = useSessionStore((s) => !!s.adminToken);
  const name = operator ?? (admin ? "Admin" : null);
  if (!name) return null;
  return (
    <span
      className="grid h-8 w-8 place-items-center rounded-full text-[13px] font-bold"
      style={{ background: "var(--blue-soft)", color: "var(--blue)" }}
      title={name}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
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
        "grid h-8 w-8 place-items-center rounded-full transition hover:bg-[var(--soft)]",
        soundOn ? "text-innotech" : "txf",
      )}
    >
      {soundOn ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </button>
  );
}
