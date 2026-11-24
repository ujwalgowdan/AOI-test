import type { ZodTypeAny, z } from "zod";

import {
  type AnalyzeResponse,
  AnalyzeResponseSchema,
  type ChatResponse,
  ChatResponseSchema,
  type DailySummary,
  DailySummarySchema,
  HealthSchema,
  type PeekResponse,
  PeekResponseSchema,
  type Person,
  PersonListSchema,
  PersonSchema,
  type SessionState,
  SessionStateSchema,
} from "@/lib/schemas";

export type { AnalyzeResponse, ChatResponse, DailySummary, PeekResponse, Person, SessionState };

const BASE = ""; // same-origin via Vite proxy / nginx

// F-05 station token. Empty (default) = send nothing, backend behaves as before.
// ponytail: baked into the bundle at build time — visible to anyone who loads the UI.
const STATION_TOKEN: string = import.meta.env.VITE_STATION_TOKEN ?? "";

/** fetch() plus the X-Station-Token header when a token is configured. */
function sfetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!STATION_TOKEN) return fetch(input, init);
  const headers = {
    ...((init.headers ?? {}) as Record<string, string>),
    "X-Station-Token": STATION_TOKEN,
  };
  return fetch(input, { ...init, headers });
}

/** For URLs the browser loads itself (<img>, <a>, WebSocket): no headers possible. */
export function withStationToken(url: string): string;
export function withStationToken(url: string | null | undefined): string | undefined;
export function withStationToken(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (!STATION_TOKEN) return url;
  return `${url}${url.includes("?") ? "&" : "?"}station_token=${encodeURIComponent(STATION_TOKEN)}`;
}

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "HttpError";
  }
}

// FastAPI returns 422 validation errors as `{detail: [{loc, msg, type}, ...]}`
// — coerce that (and any other non-string payload) into something the
// `toast.error(err.message)` path can display. Without this the user
// sees the literal string "[object Object]".
function formatDetail(raw: unknown, fallback: string): string {
  if (raw == null) return fallback;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const parts = raw
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          const loc = Array.isArray((item as { loc?: unknown[] }).loc)
            ? ((item as { loc: unknown[] }).loc as unknown[]).join(".")
            : "";
          const msg = String((item as { msg?: unknown }).msg ?? "");
          return loc ? `${loc}: ${msg}` : msg;
        }
        return typeof item === "string" ? item : JSON.stringify(item);
      })
      .filter(Boolean);
    return parts.join("; ") || fallback;
  }
  try {
    return JSON.stringify(raw);
  } catch {
    return fallback;
  }
}

/**
 * Non-2xx response -> HttpError whose message is FastAPI's `detail`, made
 * readable by formatDetail, falling back to the status text when the body is
 * not JSON or carries no `detail`. Reads the body exactly once.
 */
async function httpErrorFrom(res: Response): Promise<HttpError> {
  let detail: string = res.statusText;
  try {
    const body = (await res.json()) as { detail?: unknown };
    detail = formatDetail(body?.detail, res.statusText);
  } catch {
    /* body wasn't JSON */
  }
  return new HttpError(res.status, detail);
}

// Overload signatures must sit directly above the implementation (TS2389).
async function http<S extends ZodTypeAny>(
  path: string,
  schema: S,
  init?: RequestInit,
): Promise<z.infer<S>>;
async function http(path: string, schema: null, init?: RequestInit): Promise<void>;
async function http<S extends ZodTypeAny>(
  path: string,
  schema: S | null,
  init: RequestInit = {},
): Promise<z.infer<S> | undefined> {
  // IMPORTANT: spread `init` FIRST and set `headers` last. Doing it the
  // other way round lets `init.headers` clobber the default Content-Type,
  // so authenticated POSTs (Add operator / Add inspector) shipped a body
  // with the browser-default `text/plain;charset=UTF-8`, FastAPI didn't
  // parse it as JSON, and Pydantic rejected the raw bytes with a 422
  // `model_attributes_type` validation error. The merged object below
  // preserves any caller-supplied headers (e.g. Authorization) and still
  // guarantees Content-Type is set.
  const res = await sfetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });

  if (!res.ok) throw await httpErrorFrom(res);

  if (res.status === 204 || schema === null) return undefined;

  const body = await res.json();
  return schema.parse(body);
}

/**
 * Build the header object every authenticated call needs.
 *
 * `Content-Type: application/json` is set at the call site (not just by
 * `http()`'s default) so that a future refactor of the helper can't
 * silently drop it again — the original bug was exactly that: a header
 * merge order let Authorization clobber the default Content-Type, the
 * browser fell back to `text/plain`, FastAPI didn't parse the body as
 * JSON, and every Add operator / Add inspector POST 422'd.
 */
function jsonHeaders(token: string | null, hasBody: boolean): HeadersInit {
  const h: Record<string, string> = {};
  if (hasBody) h["Content-Type"] = "application/json";
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export const api = {
  health: () => http("/healthz", HealthSchema),

  verifyAdmin: (token: string) =>
    http("/api/auth/verify", null, { method: "GET", headers: jsonHeaders(token, false) }),

  listEmployees: () => http("/api/employees", PersonListSchema),
  addEmployee: (p: Person, token: string) =>
    http("/api/employees", PersonSchema, {
      method: "POST",
      body: JSON.stringify(p),
      headers: jsonHeaders(token, true),
    }),
  updateEmployee: (id: string, body: Partial<Person>, token: string) =>
    http(`/api/employees/${encodeURIComponent(id)}`, PersonSchema, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: jsonHeaders(token, true),
    }),
  removeEmployee: (id: string, token: string) =>
    http(`/api/employees/${encodeURIComponent(id)}`, null, {
      method: "DELETE",
      headers: jsonHeaders(token, false),
    }),

  listInspectors: () => http("/api/inspectors", PersonListSchema),
  addInspector: (p: Person, token: string) =>
    http("/api/inspectors", PersonSchema, {
      method: "POST",
      body: JSON.stringify(p),
      headers: jsonHeaders(token, true),
    }),
  updateInspector: (id: string, body: Partial<Person>, token: string) =>
    http(`/api/inspectors/${encodeURIComponent(id)}`, PersonSchema, {
      method: "PUT",
      body: JSON.stringify(body),
      headers: jsonHeaders(token, true),
    }),
  removeInspector: (id: string, token: string) =>
    http(`/api/inspectors/${encodeURIComponent(id)}`, null, {
      method: "DELETE",
      headers: jsonHeaders(token, false),
    }),

  startSession: (employee_id: string, inspector_id: string) =>
    http("/api/sessions/start", SessionStateSchema, {
      method: "POST",
      body: JSON.stringify({ employee_id, inspector_id }),
    }),
  stopSession: (sid: string) =>
    http(`/api/sessions/${sid}/stop`, SessionStateSchema, { method: "POST" }),
  getSession: (sid: string) => http(`/api/sessions/${sid}`, SessionStateSchema),

  analyze: async (
    sid: string,
    blob: Blob,
    roi?: { x: number; y: number; w: number; h: number },
  ): Promise<AnalyzeResponse> => {
    const form = new FormData();
    form.append("frame", blob, "frame.jpg");
    if (roi) {
      form.append("roi_x", String(roi.x));
      form.append("roi_y", String(roi.y));
      form.append("roi_w", String(roi.w));
      form.append("roi_h", String(roi.h));
    }
    const res = await sfetch(`/api/sessions/${sid}/analyze`, { method: "POST", body: form });
    if (!res.ok) throw await httpErrorFrom(res);
    return AnalyzeResponseSchema.parse(await res.json());
  },

  // Readiness probe. Polled at low cadence from the dashboard while the
  // operator lines up a cable so the camera card can show READY vs.
  // NOT DETECTED. Doesn't touch session state.
  peek: async (
    blob: Blob,
    roi?: { x: number; y: number; w: number; h: number },
    signal?: AbortSignal,
  ): Promise<PeekResponse> => {
    const form = new FormData();
    form.append("frame", blob, "frame.jpg");
    if (roi) {
      form.append("roi_x", String(roi.x));
      form.append("roi_y", String(roi.y));
      form.append("roi_w", String(roi.w));
      form.append("roi_h", String(roi.h));
    }
    const res = await sfetch("/api/detect/peek", { method: "POST", body: form, signal });
    if (!res.ok) throw await httpErrorFrom(res);
    return PeekResponseSchema.parse(await res.json());
  },

  dailySummary: (): Promise<DailySummary> => http("/api/daily/summary", DailySummarySchema),
  // Admin token is optional: report-type answers need it only in station mode, ZIP always.
  chat: (question: string, sessionId: string | null, token: string | null): Promise<ChatResponse> =>
    http("/api/chat", ChatResponseSchema, {
      method: "POST",
      headers: jsonHeaders(token, true),
      body: JSON.stringify({ question, session_id: sessionId }),
    }),
  generateRangePdf: async (
    start: string,
    end: string,
    token: string | null = null, // only required when the station-token flag is on
  ): Promise<{ blob: Blob; filename: string }> => {
    const res = await sfetch("/api/reports/range/generate", {
      method: "POST",
      headers: jsonHeaders(token, true),
      body: JSON.stringify({ start, end }),
    });
    // FastAPI's 422 `detail` (start/end validation) surfaces as readable text.
    if (!res.ok) throw await httpErrorFrom(res);
    const cd = res.headers.get("content-disposition") ?? "";
    const m = cd.match(/filename="([^"]+)"/);
    const filename = m?.[1] ?? `range_report_${start}_to_${end}.pdf`;
    return { blob: await res.blob(), filename };
  },
  downloadCaptures: async (
    start: string,
    end: string,
    result: "all" | "OK" | "NOT OK",
    token: string,
  ): Promise<{ blob: Blob; filename: string }> => {
    const qs = new URLSearchParams({ start, end, result }).toString();
    const res = await sfetch(`/api/captures/download/zip?${qs}`, {
      headers: jsonHeaders(token, false),
    });
    // 401/403/413 surface with the FastAPI `detail`, not a bare status code.
    if (!res.ok) throw await httpErrorFrom(res);
    // Pull the filename out of Content-Disposition; fall back to a sensible
    // default if the header is missing or unparseable.
    const cd = res.headers.get("content-disposition") ?? "";
    const m = cd.match(/filename="([^"]+)"/);
    const filename = m?.[1] ?? `captures_${start}_to_${end}.zip`;
    return { blob: await res.blob(), filename };
  },
};

export function wsSessionUrl(sid: string): string {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return withStationToken(`${proto}://${location.host}/ws/session/${sid}`);
}
