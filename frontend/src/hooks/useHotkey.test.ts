import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useHotkey } from "./useHotkey";

function dispatchKey(target: EventTarget | null, code: string, key: string) {
  const event = new KeyboardEvent("keydown", { code, key, bubbles: true, cancelable: true });
  Object.defineProperty(event, "target", { value: target ?? window });
  window.dispatchEvent(event);
}

describe("useHotkey", () => {
  it("fires the handler for the configured key", () => {
    const handler = vi.fn();
    renderHook(() => useHotkey("Space", handler));
    dispatchKey(null, "Space", " ");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not fire when an input is focused", () => {
    const handler = vi.fn();
    const input = document.createElement("input");
    document.body.appendChild(input);
    renderHook(() => useHotkey("Space", handler));
    dispatchKey(input, "Space", " ");
    expect(handler).not.toHaveBeenCalled();
    input.remove();
  });

  it("respects the enabled flag", () => {
    const handler = vi.fn();
    renderHook(() => useHotkey("Space", handler, false));
    dispatchKey(null, "Space", " ");
    expect(handler).not.toHaveBeenCalled();
  });
});
