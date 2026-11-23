import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom 25 on some Node versions ships a localStorage shim without Storage
// methods. Replace it with a deterministic Map-backed implementation so tests
// that read/write tokens behave the same locally and in CI.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
    removeItem(key: string) {
      store.delete(key);
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
  };
}

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  writable: true,
  value: createMemoryStorage(),
});

afterEach(() => {
  cleanup();
  globalThis.localStorage.clear();
});
