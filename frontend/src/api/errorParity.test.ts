import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpError, api } from "./client";

// F-23: for the same non-2xx server response, `analyze` (capture) and `peek`
// (readiness probe) must produce the same HttpError status + message that the
// shared http() path already produces (e.g. via `listEmployees`).

const ORIGINAL_FETCH = global.fetch;
afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

type Case = { name: string; status: number; statusText: string; body: string; contentType: string };
const JSON_CT = "application/json";
const CASES: Case[] = [
  {
    name: "422 FastAPI validation list",
    status: 422,
    statusText: "Unprocessable Entity",
    contentType: JSON_CT,
    body: JSON.stringify({
      detail: [{ loc: ["body", "frame"], msg: "Field required", type: "missing" }],
    }),
  },
  {
    name: "500 object detail",
    status: 500,
    statusText: "Internal Server Error",
    contentType: JSON_CT,
    body: JSON.stringify({ detail: { code: "E1", msg: "boom" } }),
  },
  {
    name: "400 string detail",
    status: 400,
    statusText: "Bad Request",
    contentType: JSON_CT,
    body: JSON.stringify({ detail: "Unknown session" }),
  },
  {
    name: "503 JSON without detail",
    status: 503,
    statusText: "Service Unavailable",
    contentType: JSON_CT,
    body: JSON.stringify({ error: "maintenance" }),
  },
  {
    name: "502 non-JSON body",
    status: 502,
    statusText: "Bad Gateway",
    contentType: "text/html",
    body: "<html>bad gateway</html>",
  },
];

// A fresh Response per call, so every call reads its own body exactly once.
function serve(c: Case) {
  global.fetch = vi.fn<typeof fetch>(
    async () =>
      new Response(c.body, {
        status: c.status,
        statusText: c.statusText,
        headers: { "Content-Type": c.contentType },
      }),
  ) as unknown as typeof fetch;
}

async function errorOf(call: () => Promise<unknown>): Promise<{ status: number; message: string }> {
  try {
    await call();
  } catch (e) {
    expect(e).toBeInstanceOf(HttpError);
    const err = e as HttpError;
    return { status: err.status, message: err.message };
  }
  throw new Error("expected the call to throw");
}

const frame = () => new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });

// Serve one Response and count how often its body is consumed.
function serveCounting(c: Case) {
  const reads = { n: 0 };
  global.fetch = vi.fn<typeof fetch>(async () => {
    const res = new Response(c.body, {
      status: c.status,
      statusText: c.statusText,
      headers: { "Content-Type": c.contentType },
    });
    for (const m of ["json", "text", "blob", "arrayBuffer"] as const) {
      const orig = res[m].bind(res);
      // biome-ignore lint/suspicious/noExplicitAny: test instrumentation
      (res as any)[m] = (...a: unknown[]) => {
        reads.n++;
        // biome-ignore lint/suspicious/noExplicitAny: test instrumentation
        return (orig as any)(...a);
      };
    }
    return res;
  }) as unknown as typeof fetch;
  return reads;
}

describe("F-23: error path reads the body once and keeps the HTTP status", () => {
  for (const c of CASES) {
    for (const [name, call] of [
      ["analyze", () => api.analyze("sid", frame())],
      ["peek", () => api.peek(frame())],
    ] as const) {
      it(`${name} — ${c.name}`, async () => {
        const reads = serveCounting(c);
        const err = await errorOf(call);
        expect(err.status).toBe(c.status);
        expect(reads.n).toBe(1);
      });
    }
  }
});

describe("F-23: peek cancellation is unchanged", () => {
  it("passes the AbortSignal to fetch and rejects with the abort error, not HttpError", async () => {
    const controller = new AbortController();
    let seenSignal: AbortSignal | undefined;
    global.fetch = vi.fn<typeof fetch>(async (_input, init) => {
      seenSignal = init?.signal ?? undefined;
      if (init?.signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    controller.abort();
    const outcome = await api.peek(frame(), undefined, controller.signal).then(
      () => "resolved",
      (e: unknown) => e,
    );
    expect(seenSignal).toBe(controller.signal);
    expect(outcome).not.toBeInstanceOf(HttpError);
    expect((outcome as DOMException).name).toBe("AbortError");
  });
});

describe("F-23: analyze/peek error messages match http()", () => {
  for (const c of CASES) {
    it(`analyze — ${c.name}`, async () => {
      serve(c);
      const expected = await errorOf(() => api.listEmployees());
      serve(c);
      expect(await errorOf(() => api.analyze("sid", frame()))).toEqual(expected);
    });

    it(`peek — ${c.name}`, async () => {
      serve(c);
      const expected = await errorOf(() => api.listEmployees());
      serve(c);
      expect(await errorOf(() => api.peek(frame()))).toEqual(expected);
    });
  }
});
