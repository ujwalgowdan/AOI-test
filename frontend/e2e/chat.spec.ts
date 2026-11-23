import { type Page, expect, test } from "@playwright/test";

import { defaultState, mockApi } from "./fixtures";

// Canned /api/chat replies (the backend's real shapes). The UI only displays them.
const base = {
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
const REPLIES: Record<string, object> = {
  "How many OK vs NOT OK in this session?": {
    ...base,
    kind: "data",
    intent: "session_counts",
    text: "This session: 2 OK, 1 NOT OK (and 0 NOT DETECTED, which the dashboard badge doesn't count).",
    columns: ["Result", "Count"],
    rows: [
      ["OK", 2],
      ["NOT OK", 1],
      ["NOT DETECTED", 0],
    ],
    source: "captures · session test-sid",
  },
  "delete EMP001": {
    ...base,
    kind: "refusal",
    reason: "write_request",
    text: "I only read inspection data. I can't add, change, delete, start or stop anything.",
    matched_by: null,
  },
  "Download captures for this date range as ZIP.": {
    ...base,
    kind: "action",
    text: "Open Reports to download the ZIP",
    action: {
      name: "download_zip",
      label: "Open Reports to download the ZIP",
      start: "2031-06-01",
      end: "2031-06-12",
    },
  },
};

async function mockChat(page: Page, seen: { question: string; session_id: string | null }[]) {
  await page.route("**/api/chat", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    seen.push(body);
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(
        REPLIES[body.question] ?? { ...base, kind: "unknown", text: "I can answer…" },
      ),
    });
  });
}

test("assistant: ask a data question, get refused on a command, and jump to Reports for the ZIP", async ({
  page,
}) => {
  const seen: { question: string; session_id: string | null }[] = [];
  await mockApi(page, defaultState());
  await mockChat(page, seen);
  await page.goto("/");
  await page.getByLabel("Operator", { exact: true }).selectOption("EMP001");
  await page.getByLabel("First-piece inspector").selectOption("INS001");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByRole("button", { name: "End session" })).toBeVisible();

  const launcher = page.getByRole("button", { name: "Open chatbot" });
  await launcher.click();
  const sheet = page.getByRole("dialog", { name: "Assistant" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("textbox", { name: "Question" })).toBeFocused();
  for (const g of ["Operator", "Inspector", "Admin"]) {
    await expect(sheet.getByRole("region", { name: `${g} questions` })).toBeVisible();
  }

  // Starter chip -> data answer with its facts table; the live session id is sent.
  await sheet.getByRole("button", { name: "How many OK vs NOT OK in this session?" }).click();
  const log = sheet.getByRole("log", { name: "Conversation" });
  await expect(log.getByText(/^This session: 2 OK, 1 NOT OK/)).toBeVisible();
  await expect(log.getByRole("table")).toContainText("NOT DETECTED");
  await expect(log.getByText("Source: captures · session test-sid")).toBeVisible();
  expect(seen[0]?.session_id).toBeTruthy();

  // Typed command -> refusal.
  await sheet.getByRole("textbox", { name: "Question" }).fill("delete EMP001");
  await sheet.getByRole("textbox", { name: "Question" }).press("Enter");
  await expect(log.getByText(/^I only read inspection data/)).toBeVisible();

  // Escape closes and returns focus to the launcher; history survives reopening.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(launcher).toBeFocused();
  await launcher.click();
  await expect(log.getByText(/^This session: 2 OK/)).toBeVisible();

  // ZIP action -> Reports with the dates pre-filled (download still needs the admin).
  // After the first question the starters move into the "Example questions" disclosure.
  await sheet.getByText("Example questions").click();
  await sheet
    .getByRole("button", { name: "Download captures for this date range as ZIP." })
    .click();
  await log.getByRole("button", { name: "Open Reports to download the ZIP" }).click();
  await expect(page).toHaveURL(/\/reports\?start=2031-06-01&end=2031-06-12$/);
  await expect(page.getByLabel("Start date")).toHaveValue("2031-06-01");
  await expect(page.getByLabel("End date")).toHaveValue("2031-06-12");
});
