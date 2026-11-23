import { expect, test } from "@playwright/test";

import { defaultState, mockApi } from "./fixtures";

test("settings unlocks and adds an employee", async ({ page }) => {
  const state = defaultState();
  await mockApi(page, state);

  await page.goto("/settings");

  // Admin gate
  await expect(page.getByRole("heading", { name: "Admin sign-in required" })).toBeVisible();
  await page.getByPlaceholder("Admin password").fill("admin123");
  await page.getByRole("button", { name: "Unlock" }).click();

  // After unlock, employees table loads
  await expect(page.getByRole("heading", { name: /Operators/i })).toBeVisible();
  await expect(page.getByText("Alice")).toBeVisible();

  // Add a new employee
  await page.getByRole("button", { name: "Add" }).first().click();
  await page.getByLabel("ID").fill("EMP010");
  await page.getByLabel("Name").fill("Carol");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("cell", { name: "Carol", exact: true })).toBeVisible();
  expect(state.employees.map((e) => e.id)).toContain("EMP010");
});
