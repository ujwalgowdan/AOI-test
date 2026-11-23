import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError, api } from "./client";

const ORIGINAL_FETCH = global.fetch;

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

function mockFetchOnce(body: unknown, init: { status?: number; ok?: boolean } = {}): FetchMock {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const spy = vi.fn<typeof fetch>(
    async () =>
      ({
        ok,
        status,
        statusText: ok ? "OK" : "Error",
        json: async () => body,
        blob: async () => new Blob([JSON.stringify(body)]),
      }) as unknown as Response,
  );
  global.fetch = spy as unknown as typeof fetch;
  return spy;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("api.listEmployees", () => {
  it("validates with Zod and returns the typed array", async () => {
    mockFetchOnce([
      { id: "EMP001", name: "Alice" },
      { id: "EMP002", name: "Bob" },
    ]);
    const result = await api.listEmployees();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("EMP001");
  });

  it("throws HttpError carrying the parsed detail on non-2xx", async () => {
    mockFetchOnce({ detail: "Boom" }, { status: 500, ok: false });
    await expect(api.listEmployees()).rejects.toMatchObject({
      name: "HttpError",
      status: 500,
      message: "Boom",
    });
  });

  it("formats FastAPI 422 validation arrays into a readable string", async () => {
    // Regression: before the formatDetail() fix this surfaced as the
    // literal "[object Object]" toast on the Settings page.
    mockFetchOnce(
      {
        detail: [
          {
            loc: ["body", "id"],
            msg: "String should have at least 1 character",
            type: "string_too_short",
          },
          { loc: ["body", "name"], msg: "Field required", type: "missing" },
        ],
      },
      { status: 422, ok: false },
    );
    await expect(api.listEmployees()).rejects.toMatchObject({
      name: "HttpError",
      status: 422,
      message: "body.id: String should have at least 1 character; body.name: Field required",
    });
  });
});

describe("api.addEmployee", () => {
  it("sends the Authorization bearer header", async () => {
    const spy = mockFetchOnce({ id: "EMP010", name: "Carol" });
    await api.addEmployee({ id: "EMP010", name: "Carol" }, "secret");
    const [, init] = spy.mock.calls[0];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret");
  });

  it("keeps Content-Type: application/json alongside Authorization", async () => {
    // Regression: when callers passed `headers: { Authorization: ... }`,
    // the earlier `{ headers, ...init }` spread clobbered the default
    // Content-Type. FastAPI then refused to parse the JSON body and
    // every authenticated POST 422'd.
    const spy = mockFetchOnce({ id: "EMP011", name: "Dan" });
    await api.addEmployee({ id: "EMP011", name: "Dan" }, "secret");
    const [, init] = spy.mock.calls[0];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers.Authorization).toBe("Bearer secret");
  });
});

describe("api.analyze", () => {
  it("POSTs FormData with a frame field", async () => {
    const spy = mockFetchOnce({
      result: "OK",
      detected_order: ["yellow", "green"],
      expected_order: ["yellow", "green"],
      image_url: "/api/captures/x.jpg",
      ok_count: 1,
      not_ok_count: 0,
    });
    await api.analyze("sid-1", new Blob(["fake-jpeg"], { type: "image/jpeg" }));
    const [, init] = spy.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    const fd = init?.body as FormData;
    expect(fd.get("frame")).toBeInstanceOf(Blob);
  });
});

describe("HttpError", () => {
  it("carries status and is instanceof Error", () => {
    const err = new HttpError(404, "Not found");
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(404);
    expect(err.name).toBe("HttpError");
  });
});
