import { afterEach, describe, expect, it, vi } from "vitest";

// F-05: the station token is read at module load, so each case re-imports the client.
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function load(token: string) {
  vi.stubEnv("VITE_STATION_TOKEN", token);
  vi.resetModules();
  return import("./client");
}

function mockFetch() {
  const spy = vi.fn<typeof fetch>(async () => new Response("[]", { status: 200 }));
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("station token off (default)", () => {
  it("leaves URLs and headers untouched", async () => {
    const { api, withStationToken, wsSessionUrl } = await load("");
    expect(withStationToken("/api/captures/a.jpg")).toBe("/api/captures/a.jpg");
    expect(withStationToken(null)).toBeUndefined();
    expect(wsSessionUrl("s1")).not.toContain("station_token");
    const spy = mockFetch();
    await api.listEmployees();
    const init = spy.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty("X-Station-Token");
  });
});

describe("station token on", () => {
  it("adds the header to fetches and the query param to browser-loaded URLs", async () => {
    const { api, withStationToken, wsSessionUrl } = await load("t 1");
    expect(withStationToken("/api/captures/a.jpg")).toBe("/api/captures/a.jpg?station_token=t%201");
    expect(withStationToken("/x?y=1")).toBe("/x?y=1&station_token=t%201");
    expect(wsSessionUrl("s1")).toMatch(/\/ws\/session\/s1\?station_token=t%201$/);
    const spy = mockFetch();
    await api.listEmployees();
    const headers = (spy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers["X-Station-Token"]).toBe("t 1");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
