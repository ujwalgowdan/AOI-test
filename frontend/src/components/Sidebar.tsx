import { ChevronDown } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation } from "react-router-dom";

import { STATION } from "@/lib/console";
import { cn } from "@/lib/utils";
import { useSessionStore } from "@/store/session";

type SlotName = "setup" | "wire" | "start";
const SlotsContext = createContext<Record<SlotName, HTMLElement | null>>({
  setup: null,
  wire: null,
  start: null,
});

/** Renders `children` into the station rail's Session setup / Wire reference /
 *  Start session area. The page (Dashboard) keeps owning the state behind them
 *  (camera, readiness), so moving the controls into the rail changes placement,
 *  not behaviour. */
export function SidebarSlot({ name, children }: { name: SlotName; children: React.ReactNode }) {
  const el = useContext(SlotsContext)[name];
  return el ? createPortal(children, el) : null;
}

/** Station rail (workflow stages + session setup) beside the page. Lives in
 *  the App shell, outside the page ErrorBoundary, so navigation stays
 *  available even when a page fails. Stacks above the page below `lg`. */
export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [setup, setSetup] = useState<HTMLElement | null>(null);
  const [wire, setWire] = useState<HTMLElement | null>(null);
  const [start, setStart] = useState<HTMLElement | null>(null);
  const { pathname } = useLocation();
  const session = useSessionStore((s) => s.session);
  const employeeId = useSessionStore((s) => s.selectedEmployeeId);
  const inspectorId = useSessionStore((s) => s.selectedInspectorId);
  const active = !!session?.active;
  const setupDone = active || (!!employeeId && !!inspectorId);
  const onDashboard = pathname === "/";
  // Once setup is done the Session setup card collapses to a one-line summary
  // (green tick + chevron); the chevron re-opens it for edits. All its info
  // then lives on the Live inspection card (rendered by the Dashboard into
  // the wire slot).
  const [setupOpen, setSetupOpen] = useState(false);
  const setupCollapsed = setupDone && !setupOpen;

  return (
    <SlotsContext.Provider value={{ setup, wire, start }}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside
          aria-label="Session and navigation"
          className="flex shrink-0 flex-col gap-3 border-b p-3 lg:w-[270px] lg:overflow-y-auto lg:border-b-0 lg:border-r"
          style={{ background: "var(--card)", borderColor: "var(--line)" }}
        >
          <div className="pane-h" style={{ border: "none", padding: "2px 2px 0" }}>
            <span className="picon">◆</span>Station - {STATION.name}
          </div>
          <div ref={setStart} data-slot="start" className="empty:hidden" />
          <nav aria-label="Main" className="flex flex-col gap-2.5">
            <div className={cn("stage", setupDone && "done")}>
              {setupDone ? (
                <button
                  type="button"
                  className="stage-nm w-full cursor-pointer"
                  onClick={() => setSetupOpen((o) => !o)}
                  aria-expanded={setupOpen}
                  aria-label="Session setup"
                >
                  <span className="flex-1 text-left">Session setup</span>
                  <span className="chevok" aria-hidden="true">
                    ✓
                  </span>
                  <ChevronDown
                    className="chev h-3.5 w-3.5 transition-transform"
                    style={{ transform: setupOpen ? "rotate(180deg)" : undefined }}
                    aria-hidden="true"
                  />
                </button>
              ) : (
                <span className="stage-nm">
                  <span className="flex-1">Session setup</span>
                </span>
              )}
              <div className="stage-st">Operator + inspector picked</div>
              <div
                ref={setSetup}
                data-slot="setup"
                className={cn("mt-2 empty:hidden", setupCollapsed && "hidden")}
              />
            </div>

            <NavLink
              to="/"
              end
              className={cn("stage", active && "active", onDashboard && !active && "active")}
            >
              <span className="stage-nm">
                <span className="flex-1">Live inspection</span>
              </span>
              <div className="stage-st">
                {active
                  ? `In progress - ${(session?.ok_count ?? 0) + (session?.not_ok_count ?? 0)} captures`
                  : setupDone
                    ? "Camera · capture · verdict"
                    : "Waiting for session setup"}
              </div>
              {/* Away from the Dashboard the page slots are unmounted, so the
                  rail itself shows the basic operator / inspector lines. On the
                  Dashboard the full session info comes through the wire slot. */}
              {!onDashboard && active && (
                <div className="subs">
                  {session?.employee_name && (
                    <span className="sub-row">
                      <span className="sd" />
                      Operator: {session.employee_name}
                      <span className="tk">✓</span>
                    </span>
                  )}
                  {session?.inspector_name && (
                    <span className="sub-row">
                      <span className="sd" />
                      Inspector: {session.inspector_name}
                      <span className="tk">✓</span>
                    </span>
                  )}
                </div>
              )}
              <div ref={setWire} data-slot="wire" className="mt-2 empty:hidden" />
            </NavLink>

            <NavLink to="/reports" className={cn("stage", pathname === "/reports" && "active")}>
              <span className="stage-nm">
                <span className="flex-1">Reports</span>
              </span>
              <div className="stage-st">Pass rate · ZIP · PDF range</div>
            </NavLink>

            <NavLink
              to="/quality/spc"
              className={cn("stage", pathname.startsWith("/quality") && "active")}
            >
              <span className="stage-nm">
                <span className="flex-1">Quality</span>
              </span>
              <div className="stage-st">SPC chart</div>
            </NavLink>

            <NavLink to="/settings" className={cn("stage", pathname === "/settings" && "active")}>
              <span className="stage-nm">
                <span className="flex-1">Admin</span>
              </span>
              <div className="stage-st">Operators · Inspectors · Admin</div>
            </NavLink>
          </nav>
        </aside>
        <main className="flex-1 lg:min-h-0 lg:overflow-y-auto">{children}</main>
      </div>
    </SlotsContext.Provider>
  );
}
