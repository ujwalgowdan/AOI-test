import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { CaptureResult } from "@/lib/console";

/** One `/analyze` result, kept so the UI can show history, thumbnails and the
 *  wire-swap reason — the daily summary endpoint carries none of these. */
export interface CaptureRecord {
  sessionId: string;
  seq: number; // capture number within the session
  at: string; // ISO timestamp (client clock)
  result: CaptureResult;
  imageUrl: string | null;
  detected: string[];
  expected: string[];
  operator: string;
  inspector: string;
}

interface CapturesStore {
  records: CaptureRecord[]; // newest first
  add: (r: CaptureRecord) => void;
}

// ponytail: capped at 200 per browser. Reports' NOT OK strip only sees what
// this station captured; a backend history endpoint is the upgrade path.
const MAX = 200;

export const useCapturesStore = create<CapturesStore>()(
  persist(
    (set) => ({
      records: [],
      add: (r) => set((s) => ({ records: [r, ...s.records].slice(0, MAX) })),
    }),
    { name: "aoi.captures", storage: createJSONStorage(() => localStorage) },
  ),
);
