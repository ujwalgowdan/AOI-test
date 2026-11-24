import type { SessionState } from "@/api/client";
import { create } from "zustand";

interface SessionStore {
  session: SessionState | null;
  setSession: (s: SessionState | null) => void;
  applyLive: (
    patch: Partial<
      Pick<SessionState, "ok_count" | "not_ok_count" | "last_result" | "last_image_url">
    >,
  ) => void;

  selectedEmployeeId: string;
  selectedInspectorId: string;
  setSelectedEmployeeId: (id: string) => void;
  setSelectedInspectorId: (id: string) => void;

  /** Unit under test ("1" or "2"), picked in Session setup and shown on the
   *  Live inspection card and the Admin Station card. */
  selectedUnit: string;
  setSelectedUnit: (unit: string) => void;

  adminToken: string | null;
  setAdminToken: (token: string | null) => void;
}

const ADMIN_KEY = "aoi.adminToken";

function readAdminToken(): string | null {
  try {
    return globalThis.localStorage?.getItem(ADMIN_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeAdminToken(token: string | null) {
  try {
    if (!globalThis.localStorage) return;
    if (token) globalThis.localStorage.setItem(ADMIN_KEY, token);
    else globalThis.localStorage.removeItem(ADMIN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  session: null,
  setSession: (s) => set({ session: s }),
  applyLive: (patch) => {
    const current = get().session;
    if (!current) return;
    set({ session: { ...current, ...patch } });
  },

  selectedEmployeeId: "",
  selectedInspectorId: "",
  setSelectedEmployeeId: (id) => set({ selectedEmployeeId: id }),
  setSelectedInspectorId: (id) => set({ selectedInspectorId: id }),

  selectedUnit: "1",
  setSelectedUnit: (unit) => set({ selectedUnit: unit }),

  adminToken: readAdminToken(),
  setAdminToken: (token) => {
    writeAdminToken(token);
    set({ adminToken: token });
  },
}));
