import { Camera, FileText, Settings as SettingsIcon } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

type SlotName = "setup" | "wire";
const SlotsContext = createContext<Record<SlotName, HTMLElement | null>>({
  setup: null,
  wire: null,
});

/** Renders `children` into the sidebar's Session setup / Wire reference area.
 *  The page (Dashboard) keeps owning the state behind them (camera, readiness),
 *  so moving the controls into the sidebar changes placement, not behaviour. */
export function SidebarSlot({ name, children }: { name: SlotName; children: React.ReactNode }) {
  const el = useContext(SlotsContext)[name];
  return el ? createPortal(children, el) : null;
}

/** Left sidebar (Session setup -> Navigate -> Wire reference) beside the page.
 *  Lives in the App shell, outside the page ErrorBoundary, so navigation stays
 *  available even when a page fails. Stacks above the page below `lg`. */
export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const [setup, setSetup] = useState<HTMLElement | null>(null);
  const [wire, setWire] = useState<HTMLElement | null>(null);
  return (
    <SlotsContext.Provider value={{ setup, wire }}>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <aside
          aria-label="Session and navigation"
          className="flex shrink-0 flex-col gap-4 border-b border-slate-200 bg-white p-3 lg:w-60 lg:overflow-y-auto lg:border-b-0 lg:border-r"
        >
          <div ref={setSetup} data-slot="setup" className="empty:hidden" />
          <nav aria-label="Main">
            <h2 className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Navigate
            </h2>
            <ul className="flex flex-wrap gap-1 lg:flex-col">
              <NavItem to="/" icon={<Camera className="h-4 w-4" />} label="Dashboard" />
              <NavItem to="/reports" icon={<FileText className="h-4 w-4" />} label="Reports" />
              <NavItem to="/settings" icon={<SettingsIcon className="h-4 w-4" />} label="Admin" />
            </ul>
          </nav>
          <div ref={setWire} data-slot="wire" className="empty:hidden lg:mt-auto" />
        </aside>
        <main className="flex-1 lg:min-h-0 lg:overflow-y-auto">{children}</main>
      </div>
    </SlotsContext.Provider>
  );
}

// Same NavLink, `end` matching and active styling as the former header tabs.
function NavItem({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <li>
      <NavLink
        to={to}
        end
        className={({ isActive }) =>
          cn(
            "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-innotech",
            isActive
              ? "bg-innotech/10 text-innotech ring-1 ring-innotech/20"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )
        }
      >
        {icon}
        <span>{label}</span>
      </NavLink>
    </li>
  );
}
