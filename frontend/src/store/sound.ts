import { create } from "zustand";

// Per-browser verdict-sound preference. Default on.
const KEY = "aoi.soundOn";

function read(): boolean {
  try {
    return globalThis.localStorage?.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

function write(on: boolean) {
  try {
    globalThis.localStorage?.setItem(KEY, on ? "1" : "0");
  } catch {
    /* storage unavailable — preference lasts for this page only */
  }
}

interface SoundStore {
  soundOn: boolean;
  toggle: () => void;
}

export const useSoundStore = create<SoundStore>((set, get) => ({
  soundOn: read(),
  toggle: () => {
    const next = !get().soundOn;
    write(next);
    set({ soundOn: next });
  },
}));
