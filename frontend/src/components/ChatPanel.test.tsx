import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type ChatResponse, HttpError, api } from "@/api/client";
import { MAX_CHARS, STARTERS, UNAVAILABLE, reflow } from "@/components/ChatPanel";
import { ChatbotLauncher } from "@/components/ChatbotLauncher";
import Reports, { zipQueryRange } from "@/routes/Reports";
import { useCapturesStore } from "@/store/captures";
import { useSessionStore } from "@/store/session";

vi.mock("sonner", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return { ...real, toast: { success: vi.fn(), error: vi.fn() } };
});

const base: ChatResponse = {
  kind: "data",
  text: "",
  intent: null,
  reason: null,
  columns: [],
  rows: [],
  source: "",
  image_url: null,
  card: null,
  action: null,
  suggestions: [],
  matched_by: "keywords",
};
const reply = (r: Partial<ChatResponse>): ChatResponse => ({ ...base, ...r });

const DATA = reply({
  intent: "last_failed_capture",
  text: "The last failed capture was NOT OK at 09:02:00 on 12 Jun 2031 by EMP001.",
  columns: ["Time", "Operator", "Result", "Detected", "Expected"],
  rows: [["09:02:00", "EMP001", "NOT OK", "green → yellow", "yellow → green"]],
  source: "captures · session s1",
  image_url: "/api/captures/NOT_OK_1.jpg",
});
const CARD = reply({
  kind: "card",
  text: "1. On the Dashboard…\n2. Click Start session.",
  card: {
    id: "start_session",
    title: "How do I start a new session?",
    answer: "1. On the Dashboard…\n2. Click Start session.",
  },
});
const REFUSAL = reply({
  kind: "refusal",
  reason: "write_request",
  text: "I only read inspection data. I can't add, change, delete, start or stop anything.",
  card: {
    id: "change_wire_order",
    title: "Change the expected wire colour order",
    answer: "The expected order is built into the inspection software.",
  },
});
const UNKNOWN = reply({
  kind: "unknown",
  text: "I can answer questions about inspection results, sessions and how to use this station. Try one of these:",
  suggestions: ["How many cables have I tested today?", "Why did the last capture fail?"],
});
const EXPORT = reply({
  kind: "action",
  text: "Export daily report",
  action: {
    name: "export_daily_report",
    label: "Export daily report",
    start: "2031-06-12T00:00",
    end: "2031-06-12T23:59",
  },
});
const ZIP = reply({
  kind: "action",
  text: "Open Reports to download the ZIP",
  action: {
    name: "download_zip",
    label: "Open Reports to download the ZIP",
    start: "2031-06-01",
    end: "2031-06-12",
  },
});

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{`${loc.pathname}${loc.search}`}</p>;
}

function renderLauncher() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/"]}>
        <ChatbotLauncher />
        <Routes>
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const open = () => fireEvent.click(screen.getByRole("button", { name: "Open chatbot" }));
const sheet = () => screen.getByRole("dialog", { name: "Assistant" });
const log = () => within(sheet()).getByRole("log", { name: "Conversation" });

let chat: MockInstance<typeof api.chat>;

beforeEach(() => {
  useSessionStore.setState({
    session: {
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
    },
    adminToken: "tok",
  });
  useCapturesStore.setState({ records: [] });
  chat = vi.spyOn(api, "chat").mockResolvedValue(DATA);
  vi.spyOn(api, "generateRangePdf").mockResolvedValue({
    blob: new Blob(["%PDF"]),
    filename: "r.pdf",
  });
  URL.createObjectURL = vi.fn(() => "blob:x");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("launcher and sheet", () => {
  it("is enabled, opens the Assistant sheet and focuses the question box", () => {
    renderLauncher();
    const bot = screen.getByRole("button", { name: "Open chatbot" });
    expect(bot).not.toHaveAttribute("aria-disabled");
    open();
    expect(sheet()).toBeInTheDocument();
    expect(within(sheet()).getByRole("textbox", { name: "Question" })).toHaveFocus();
  });

  it("shows the 16 starter questions grouped Operator / Inspector / Admin", () => {
    renderLauncher();
    open();
    const counts = STARTERS.map((g) => {
      const sec = within(sheet()).getByRole("region", { name: `${g.group} questions` });
      return within(sec)
        .getAllByRole("button")
        .map((b) => b.textContent);
    });
    expect(counts.map((c) => c.length)).toEqual([8, 4, 4]);
    expect(counts.flat()).toEqual(STARTERS.flatMap((g) => g.questions));
  });
});

describe("answers", () => {
  it("a chip sends the question with the live session and admin token, then shows facts, image and source", async () => {
    renderLauncher();
    open();
    fireEvent.click(
      within(sheet()).getByRole("button", { name: "Show me the last failed capture." }),
    );
    expect(chat).toHaveBeenCalledWith("Show me the last failed capture.", "s1", "tok");
    await within(log()).findByText(DATA.text);
    expect(within(log()).getByText("Show me the last failed capture.")).toBeInTheDocument();
    const table = within(log()).getByRole("table");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((h) => h.textContent),
    ).toEqual(DATA.columns);
    expect(within(table).getByText("green → yellow")).toBeInTheDocument();
    expect(within(log()).getByRole("img", { name: "Last failed capture" })).toHaveAttribute(
      "src",
      "/api/captures/NOT_OK_1.jpg",
    );
    expect(within(log()).getByText("Source: captures · session s1")).toBeInTheDocument();
  });

  it("shows an approved card with its title and full text", async () => {
    chat.mockResolvedValue(CARD);
    renderLauncher();
    open();
    fireEvent.click(within(sheet()).getByRole("button", { name: "How do I start a new session?" }));
    const card = await within(log()).findByRole("article");
    expect(within(card).getByRole("heading", { name: CARD.card?.title })).toBeInTheDocument();
    // Each numbered step is its own line.
    expect(within(card).getByText("1. On the Dashboard…").tagName).toBe("P");
    expect(within(card).getByText("2. Click Start session.").tagName).toBe("P");
  });

  it("shows a refusal as a refusal, with the attached card and no facts", async () => {
    chat.mockResolvedValue(REFUSAL);
    renderLauncher();
    open();
    fireEvent.click(
      within(sheet()).getByRole("button", { name: "Change the expected wire colour order." }),
    );
    await within(log()).findByText(REFUSAL.text);
    expect(log().querySelector('[data-kind="refusal"]')).not.toBeNull();
    expect(within(log()).getByRole("article")).toHaveTextContent(
      "built into the inspection software",
    );
    expect(within(log()).queryByRole("table")).toBeNull();
  });

  it("unknown questions get the fixed suggestions, which can be asked with one click", async () => {
    chat.mockResolvedValueOnce(UNKNOWN).mockResolvedValueOnce(DATA);
    renderLauncher();
    open();
    fireEvent.change(within(sheet()).getByRole("textbox", { name: "Question" }), {
      target: { value: "what's the weather" },
    });
    fireEvent.click(within(sheet()).getByRole("button", { name: "Send" }));
    const list = await within(log()).findByRole("list", { name: "Suggested questions" });
    fireEvent.click(within(list).getByRole("button", { name: "Why did the last capture fail?" }));
    await waitFor(() =>
      expect(chat).toHaveBeenLastCalledWith("Why did the last capture fail?", "s1", "tok"),
    );
  });

  it("a failed request shows the fixed unavailable message", async () => {
    chat.mockRejectedValue(new HttpError(503, "down"));
    renderLauncher();
    open();
    fireEvent.click(
      within(sheet()).getByRole("button", { name: "Why did the last capture fail?" }),
    );
    expect(await within(log()).findByRole("alert")).toHaveTextContent(UNAVAILABLE);
  });
});

describe("action buttons run the existing flows", () => {
  it("Export daily report runs the Reports range-PDF flow with the given bounds and admin token", async () => {
    chat.mockResolvedValue(EXPORT);
    renderLauncher();
    open();
    fireEvent.click(within(sheet()).getByRole("button", { name: "Export today's report." }));
    fireEvent.click(await within(log()).findByRole("button", { name: "Export daily report" }));
    await waitFor(() =>
      expect(api.generateRangePdf).toHaveBeenCalledWith(
        "2031-06-12T00:00",
        "2031-06-12T23:59",
        "tok",
      ),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Downloaded r.pdf"));
  });

  it("the ZIP action closes the sheet and opens Reports with the dates in the URL", async () => {
    chat.mockResolvedValue(ZIP);
    renderLauncher();
    open();
    fireEvent.click(
      within(sheet()).getByRole("button", {
        name: "Download captures for this date range as ZIP.",
      }),
    );
    fireEvent.click(
      await within(log()).findByRole("button", { name: "Open Reports to download the ZIP" }),
    );
    expect(screen.getByTestId("where")).toHaveTextContent(
      "/reports?start=2031-06-01&end=2031-06-12",
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("the ZIP action without dates opens plain Reports", async () => {
    chat.mockResolvedValue(
      reply({
        ...ZIP,
        action: { ...(ZIP.action as NonNullable<ChatResponse["action"]>), start: null, end: null },
      }),
    );
    renderLauncher();
    open();
    fireEvent.click(
      within(sheet()).getByRole("button", {
        name: "Download captures for this date range as ZIP.",
      }),
    );
    fireEvent.click(
      await within(log()).findByRole("button", { name: "Open Reports to download the ZIP" }),
    );
    expect(screen.getByTestId("where")).toHaveTextContent(/^\/reports$/);
  });
});

describe("example questions stay reachable", () => {
  it("moves the starters into an 'Example questions' disclosure after the first question", async () => {
    renderLauncher();
    open();
    fireEvent.click(
      within(sheet()).getByRole("button", { name: "Show me the last failed capture." }),
    );
    await within(log()).findByText(DATA.text);
    expect(within(log()).queryByRole("region", { name: "Operator questions" })).toBeNull();
    const examples = within(sheet())
      .getByText("Example questions")
      .closest("details") as HTMLElement;
    fireEvent.click(
      within(examples).getByRole("button", { name: "Compare today's count with yesterday." }),
    );
    expect(chat).toHaveBeenLastCalledWith("Compare today's count with yesterday.", "s1", "tok");
  });
});

describe("input rules and history", () => {
  it("limits questions to 300 characters, counts them, and blocks empty sends", () => {
    renderLauncher();
    open();
    const box = within(sheet()).getByRole("textbox", { name: "Question" });
    const send = within(sheet()).getByRole("button", { name: "Send" });
    expect(box).toHaveAttribute("maxLength", String(MAX_CHARS));
    expect(send).toBeDisabled();
    fireEvent.change(box, { target: { value: "   " } });
    expect(send).toBeDisabled();
    fireEvent.change(box, { target: { value: "abc" } });
    expect(within(sheet()).getByText("3/300")).toBeInTheDocument();
    fireEvent.submit(box.closest("form") as HTMLFormElement);
    expect(chat).toHaveBeenCalledWith("abc", "s1", "tok");
  });

  it("keeps the conversation when the sheet is closed and reopened, in memory only", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    renderLauncher();
    open();
    fireEvent.click(
      within(sheet()).getByRole("button", { name: "Show me the last failed capture." }),
    );
    await within(log()).findByText(DATA.text);
    fireEvent.click(within(sheet()).getByRole("button", { name: "Close assistant" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    open();
    expect(within(log()).getByText(DATA.text)).toBeInTheDocument();
    expect(setItem.mock.calls.some(([, v]) => String(v).includes("last failed capture"))).toBe(
      false,
    );
  });

  it("sends no session id when no session is live", async () => {
    useSessionStore.setState({ session: null, adminToken: null });
    renderLauncher();
    open();
    fireEvent.click(
      within(sheet()).getByRole("button", { name: "How many cables have I tested today?" }),
    );
    expect(chat).toHaveBeenCalledWith("How many cables have I tested today?", null, null);
  });
});

describe("Reports reads the ZIP dates from the query string", () => {
  it("accepts only real, ordered YYYY-MM-DD dates", () => {
    const q = (s: string) => zipQueryRange(new URLSearchParams(s));
    expect(q("start=2031-06-01&end=2031-06-12")).toEqual({
      start: "2031-06-01",
      end: "2031-06-12",
    });
    expect(q("start=2031-06-12&end=2031-06-01")).toBeNull();
    expect(q("start=2031-02-31&end=2031-03-01")).toBeNull();
    expect(q("start=01-06-2031&end=2031-06-12")).toBeNull();
    expect(q("start=2031-06-01")).toBeNull();
    expect(q("")).toBeNull();
  });

  it("pre-fills the ZIP start and end dates", () => {
    vi.spyOn(api, "dailySummary").mockResolvedValue({
      date: "2031-06-12",
      tests: [],
      summary: { total_count: 0, pass_count: 0, fail_count: 0, cumulative_pass_rate: 100 },
    } as never);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/reports?start=2031-06-01&end=2031-06-12"]}>
          <Reports />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByLabelText("Start date")).toHaveValue("2031-06-01");
    expect(screen.getByLabelText("End date")).toHaveValue("2031-06-12");
  });
});

describe("card display reflow keeps the approved words", () => {
  // The 7 approved answers, read from the backend's cards.yaml (block scalars).
  const yaml = readFileSync(`${__dirname}/../../../backend/app/services/chat/cards.yaml`, "utf-8");
  const answers: string[] = [];
  let current: string[] | null = null;
  for (const line of yaml.split(/\r?\n/)) {
    if (line === "    answer: |") {
      current = [];
      answers.push("");
    } else if (current && (line.startsWith("      ") || line.trim() === "")) {
      current.push(line.slice(6));
      answers[answers.length - 1] = current.join("\n");
    } else {
      current = null;
    }
  }
  const words = (s: string) => s.split(/\s+/).filter(Boolean);

  it("finds all 7 cards and changes no word in any of them", () => {
    expect(answers).toHaveLength(7);
    for (const a of answers) {
      const shown = reflow(a)
        .flat()
        .map((b) => b.text)
        .join(" ");
      expect(words(shown)).toEqual(words(a));
    }
  });

  it("joins soft wraps but keeps list items and the backup command on their own lines", () => {
    const start = reflow(answers[1] ?? "").flat();
    expect(start[0]).toEqual({
      kind: "item",
      text: "1. On the Dashboard, in Session setup on the left, choose the Operator and the First-piece inspector.",
    });
    const backup = reflow(answers[6] ?? "").flat();
    expect(backup.find((b) => b.kind === "code")?.text).toBe(
      String.raw`.\scripts\backup-aoi.ps1 -ComposeFile docker-compose.prod.yml -Project aoi-prod`,
    );
    const camera = reflow(answers[0] ?? "").flat();
    expect(camera.filter((b) => b.kind === "item").map((b) => b.text.slice(0, 2))).toEqual([
      "- ",
      "- ",
      "- ",
      "- ",
    ]);
  });
});
