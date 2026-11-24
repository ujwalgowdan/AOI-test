import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HttpError, api } from "@/api/client";
import { stationDayBounds } from "@/lib/rangeReport";
import { useCapturesStore } from "@/store/captures";
import { useSessionStore } from "@/store/session";
import App from "./App";

// Camera stub: jsdom has no getUserMedia. Like the real hook, it returns stable
// references (a fresh grabFrame per render would re-run the readiness effect forever).
vi.mock("@/hooks/useCamera", () => {
  const camera = {
    videoRef: { current: null },
    ready: false,
    error: null,
    grabFrame: async () => null,
    devices: [],
    deviceId: null,
    setDeviceId: () => {},
    zoom: 1,
    setZoom: () => {},
    zoomIn: () => {},
    zoomOut: () => {},
  };
  return { ZOOM_MIN: 1, ZOOM_MAX: 3, ZOOM_LEVELS: [1, 3], useCamera: () => camera };
});

vi.mock("sonner", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, toast: { success: vi.fn(), error: vi.fn() } };
});

const SESSION = {
  id: "s1",
  employee_id: "EMP001",
  employee_name: "Alice",
  inspector_id: "INS001",
  inspector_name: "Mr. Vinay",
  start_time: new Date().toISOString(),
  end_time: null,
  ok_count: 0,
  not_ok_count: 0,
  last_result: null,
  last_image_url: null,
  active: true,
};

function renderAt(path = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const sidebar = () => screen.getByRole("complementary", { name: "Session and navigation" });
const follows = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  useSessionStore.setState({
    session: null,
    selectedEmployeeId: "",
    selectedInspectorId: "",
    adminToken: null,
  });
  useCapturesStore.setState({ records: [] });
  vi.spyOn(api, "listEmployees").mockResolvedValue([{ id: "EMP001", name: "Alice" }]);
  vi.spyOn(api, "listInspectors").mockResolvedValue([{ id: "INS001", name: "Mr. Vinay" }]);
  vi.spyOn(api, "dailySummary").mockResolvedValue({
    date: "2026-11-19",
    tests: [],
    summary: { total_count: 0, pass_count: 0, fail_count: 0, cumulative_pass_rate: 100 },
  } as never);
  vi.spyOn(api, "generateRangePdf").mockResolvedValue({
    blob: new Blob(["%PDF"]),
    filename: "r.pdf",
  });
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  // jsdom cannot navigate; the download anchor click is a no-op here.
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  vi.useRealTimers();
});

describe("1. station rail: setup, live inspection, reports and settings stages", () => {
  it("orders the four stages and keeps every session-setup field", async () => {
    renderAt("/");
    const side = sidebar();
    const nav = within(side).getByRole("navigation", { name: "Main" });
    const setupStage = within(nav).getByText("Setup session");
    const live = within(nav).getByRole("link", { name: /^Live inspection/ });
    const reports = within(nav).getByRole("link", { name: /^Reports/ });
    const settings = within(nav).getByRole("link", { name: /^Settings/ });
    expect(follows(setupStage, live)).toBe(true);
    expect(follows(live, reports)).toBe(true);
    expect(follows(reports, settings)).toBe(true);
    const setup = await within(side).findByRole("region", { name: "Session setup" });
    expect(within(setup).getByLabelText("Operator")).toBeInTheDocument();
    expect(within(setup).getByLabelText("First-piece inspector")).toBeInTheDocument();
    expect(within(side).getByText(/Station - AOI Tester MKII/)).toBeInTheDocument();
  });

  it("session-setup selects keep their behaviour (options, selection, lock while live)", async () => {
    renderAt("/");
    const op = (await screen.findByLabelText("Operator")) as HTMLSelectElement;
    await screen.findByRole("option", { name: "Alice (EMP001)" });
    fireEvent.change(op, { target: { value: "EMP001" } });
    expect(useSessionStore.getState().selectedEmployeeId).toBe("EMP001");
    act(() => useSessionStore.setState({ session: SESSION }));
    expect(op).toBeDisabled();
  });

  it("wire reference shows the backend-reported expected order, never a hard-coded one", async () => {
    renderAt("/");
    const wire = await within(sidebar()).findByRole("region", { name: "Wire reference" });
    expect(within(wire).getByText(/Shown after the first camera check/)).toBeInTheDocument();
    act(() =>
      useCapturesStore.getState().add({
        sessionId: "s0",
        seq: 1,
        at: new Date().toISOString(),
        result: "OK",
        imageUrl: null,
        detected: ["yellow", "green"],
        expected: ["yellow", "green"],
        operator: "A",
        inspector: "B",
      }),
    );
    const items = within(wire)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(items).toEqual(["yellowleft", "greenright"]);
  });
});

describe("2. header: no Dashboard / Reports / Settings links, sidebar keeps the destinations", () => {
  it("header keeps logo, sound toggle and session badge but has no links", () => {
    renderAt("/");
    const header = screen.getByRole("banner");
    expect(within(header).queryAllByRole("link")).toHaveLength(0);
    expect(within(header).getByAltText("Innotech Integration")).toBeInTheDocument();
    expect(within(header).getByText("No active session")).toBeInTheDocument();
    expect(within(header).getByRole("button", { name: "Verdict sound" })).toBeInTheDocument();
  });

  it("rail links reach the same routes", async () => {
    renderAt("/");
    const nav = within(sidebar()).getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: /^Live inspection/ })).toHaveAttribute("href", "/");
    expect(within(nav).getByRole("link", { name: /^Reports/ })).toHaveAttribute("href", "/reports");
    expect(within(nav).getByRole("link", { name: /^Settings/ })).toHaveAttribute("href", "/settings");
    fireEvent.click(within(nav).getByRole("link", { name: /^Reports/ }));
    expect(await screen.findByRole("heading", { name: "Reports", level: 2 })).toBeInTheDocument();
    fireEvent.click(within(nav).getByRole("link", { name: /^Settings/ }));
    expect(
      await screen.findByRole("heading", { name: "Admin sign-in required" }),
    ).toBeInTheDocument();
  });
});

describe("5. Settings rail stage keeps the /settings destination and Admin page title", () => {
  it("the Settings stage is current on /settings and the page heading stays Admin", async () => {
    useSessionStore.setState({ adminToken: "tok" });
    vi.spyOn(api, "verifyAdmin").mockResolvedValue(undefined);
    renderAt("/settings");
    const settings = within(sidebar()).getByRole("link", { name: /^Settings/ });
    expect(settings).toHaveAttribute("aria-current", "page");
    expect(await screen.findByRole("heading", { name: "Admin", level: 2 })).toBeInTheDocument();
  });
});

describe("3. BuLLM Assistant panel (inline under the camera, collapsible)", () => {
  it("renders inline below the camera with the ask bar pinned at its bottom", async () => {
    vi.spyOn(api, "chat").mockResolvedValue({} as never);
    renderAt("/");
    const camera = screen.getByRole("region", { name: "Inspection camera" });
    const assistant = screen.getByRole("region", { name: "BuLLM Assistant" });
    // Below the camera in the same middle pane, not over the feed.
    expect(follows(camera, assistant)).toBe(true);
    expect(within(assistant).getByLabelText("Question")).toBeInTheDocument();
    expect(within(assistant).getByRole("button", { name: "Send" })).toBeInTheDocument();
    expect(api.chat).not.toHaveBeenCalled(); // rendering asks nothing by itself
  });

  it("collapses to its header and expands again", async () => {
    renderAt("/");
    const assistant = screen.getByRole("region", { name: "BuLLM Assistant" });
    fireEvent.click(within(assistant).getByRole("button", { name: "Collapse assistant" }));
    expect(within(assistant).queryByLabelText("Question")).toBeNull();
    fireEvent.click(within(assistant).getByRole("button", { name: "Expand assistant" }));
    expect(within(assistant).getByLabelText("Question")).toBeInTheDocument();
  });
});

describe("4. Export daily report reuses the Reports range-PDF flow for today (Asia/Kolkata)", () => {
  it("sits under the capture history entries and sends today's IST 00:00-23:59 with the admin token", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-19T20:00:00Z")); // 01:30 on 20 Nov in Asia/Kolkata
    useSessionStore.setState({ adminToken: "tok" });
    renderAt("/");
    const history = screen.getByRole("tablist", { name: "Capture history" })
      .parentElement as HTMLElement;
    const btn = within(history).getByRole("button", { name: "Export daily report" });
    expect(follows(within(history).getByRole("tabpanel"), btn)).toBe(true);
    fireEvent.click(btn);
    await waitFor(() =>
      expect(api.generateRangePdf).toHaveBeenCalledWith(
        "2026-11-20T00:00",
        "2026-11-20T23:59",
        "tok",
      ),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Downloaded r.pdf"));
  });

  it("shows the same loading state and the same error toast as Reports", async () => {
    let reject: (e: unknown) => void = () => {};
    vi.mocked(api.generateRangePdf).mockReturnValue(
      new Promise((_, r) => {
        reject = r;
      }),
    );
    renderAt("/");
    const btn = screen.getByRole("button", { name: "Export daily report" });
    fireEvent.click(btn);
    const busy = await screen.findByRole("button", { name: "Generating…" });
    expect(busy).toBeDisabled();
    await act(async () => reject(new HttpError(403, "Invalid admin token")));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Invalid admin token"));
    expect(screen.getByRole("button", { name: "Export daily report" })).toBeEnabled();
  });

  it("Reports page 'Download range PDF' still uses the same flow (today preset, token)", async () => {
    useSessionStore.setState({ adminToken: "tok" });
    renderAt("/reports");
    fireEvent.click(await screen.findByRole("button", { name: "Download range PDF" }));
    await waitFor(() => expect(api.generateRangePdf).toHaveBeenCalledTimes(1));
    const [start, end, token] = vi.mocked(api.generateRangePdf).mock.calls[0] ?? [];
    expect(start).toMatch(/T00:00$/);
    expect(end).toMatch(/T23:59$/);
    expect(token).toBe("tok");
  });
});

describe("primary capture actions unchanged", () => {
  it("Start session, CAPTURE and End session behave as before", async () => {
    vi.spyOn(api, "startSession").mockResolvedValue(SESSION);
    renderAt("/");
    const capture = screen.getByRole("button", { name: /CAPTURE/ });
    expect(capture).toBeDisabled();
    await screen.findByRole("option", { name: "Alice (EMP001)" });
    await screen.findByRole("option", { name: "Mr. Vinay (INS001)" });
    fireEvent.change(screen.getByLabelText("Operator"), { target: { value: "EMP001" } });
    fireEvent.change(screen.getByLabelText("First-piece inspector"), {
      target: { value: "INS001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Start session" }));
    await waitFor(() => expect(api.startSession).toHaveBeenCalledWith("EMP001", "INS001"));
    expect(await screen.findByRole("button", { name: "End session" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /CAPTURE/ })).toBeInTheDocument();
  });
});

describe("stationDayBounds", () => {
  it("uses the Asia/Kolkata calendar day, not UTC or the browser zone", () => {
    expect(stationDayBounds(new Date("2026-11-19T18:29:00Z"))).toEqual({
      start: "2026-11-19T00:00",
      end: "2026-11-19T23:59",
    });
    expect(stationDayBounds(new Date("2026-11-19T18:30:00Z"))).toEqual({
      start: "2026-11-20T00:00",
      end: "2026-11-20T23:59",
    });
  });
});
