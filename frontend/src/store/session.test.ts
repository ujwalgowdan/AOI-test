import { beforeEach, describe, expect, it } from "vitest";

import type { SessionState } from "@/api/client";
import { useSessionStore } from "./session";

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    id: "abc",
    employee_id: "E1",
    employee_name: "Alice",
    inspector_id: "I1",
    inspector_name: "Bob",
    start_time: "2026-01-01T08:00:00",
    end_time: null,
    ok_count: 0,
    not_ok_count: 0,
    last_result: null,
    last_image_url: null,
    active: true,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  useSessionStore.setState({
    session: null,
    selectedEmployeeId: "",
    selectedInspectorId: "",
    adminToken: null,
  });
});

describe("useSessionStore", () => {
  it("applyLive merges counts into the existing session", () => {
    useSessionStore.getState().setSession(makeSession());
    useSessionStore.getState().applyLive({ ok_count: 3, not_ok_count: 1, last_result: "OK" });
    const s = useSessionStore.getState().session;
    expect(s?.ok_count).toBe(3);
    expect(s?.not_ok_count).toBe(1);
    expect(s?.last_result).toBe("OK");
  });

  it("applyLive is a no-op when there is no session", () => {
    useSessionStore.getState().applyLive({ ok_count: 99 });
    expect(useSessionStore.getState().session).toBeNull();
  });

  it("setAdminToken persists to localStorage and clears it on null", () => {
    useSessionStore.getState().setAdminToken("secret");
    expect(localStorage.getItem("aoi.adminToken")).toBe("secret");
    expect(useSessionStore.getState().adminToken).toBe("secret");

    useSessionStore.getState().setAdminToken(null);
    expect(localStorage.getItem("aoi.adminToken")).toBeNull();
    expect(useSessionStore.getState().adminToken).toBeNull();
  });
});
