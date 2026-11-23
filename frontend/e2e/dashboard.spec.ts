import { expect, test } from "@playwright/test";

import { defaultState, mockApi } from "./fixtures";

test("dashboard idle state, start and end a session", async ({ page }) => {
  const state = defaultState();
  await mockApi(page, state);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Innotech AOI" })).toBeVisible();
  await expect(page.getByText("No active session")).toBeVisible();

  // Idle state: dashed chips, Start session, disabled CAPTURE, empty rail.
  await expect(page.locator("span", { hasText: /^Select operator$/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /CAPTURE/ })).toBeDisabled();
  await expect(page.getByText("No capture yet.")).toBeVisible();
  await expect(
    page.getByText("Capture history appears here once the session starts."),
  ).toBeVisible();

  // Chip selects are native <select>s, populated from the mocked API.
  const operator = page.getByLabel("Operator", { exact: true });
  const inspector = page.getByLabel("First-piece inspector");
  await expect(operator.locator("option")).toContainText(["Alice (EMP001)"]);
  await expect(inspector.locator("option")).toContainText(["Mr. Vinay (INS001)"]);

  await operator.selectOption("EMP001");
  await inspector.selectOption("INS001");
  await expect(page.getByText("EMP001 · operator")).toBeVisible();

  // Start → live chip, End session, pickers locked.
  await page.getByRole("button", { name: "Start session" }).click();
  await expect(page.getByText(/Session live/)).toBeVisible();
  await expect(operator).toBeDisabled();
  await expect(page.getByRole("tab", { name: /OK · 0/ }).first()).toBeVisible();

  await page.getByRole("button", { name: "End session" }).click();
  await expect(page.getByText("No active session")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start session" })).toBeVisible();
});
