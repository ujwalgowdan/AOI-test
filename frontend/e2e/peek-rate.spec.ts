import { expect, test } from "@playwright/test";

import { defaultState, mockApi } from "./fixtures";

// F-02 regression: the readiness probe must poll on its 800 ms interval,
// not re-fire after every response (was ~400 requests in 3 s).
test.use({
  launchOptions: {
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
  },
  permissions: ["camera"],
});

test("readiness probe polls /api/detect/peek at its interval", async ({ page }) => {
  await mockApi(page, defaultState());
  let calls = 0;
  await page.route("**/api/detect/peek", (route) => {
    calls++;
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ready: true,
        detected: ["green", "yellow"],
        expected: ["green", "yellow"],
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Operator", { exact: true }).selectOption("EMP001");
  await page.getByLabel("First-piece inspector").selectOption("INS001");
  await page.getByRole("button", { name: "Start session" }).click();
  await expect.poll(() => calls, { timeout: 10_000 }).toBeGreaterThan(0);

  const start = calls;
  await page.waitForTimeout(3000);
  const inWindow = calls - start;
  expect(inWindow, `peek calls in 3 s: ${inWindow}`).toBeGreaterThanOrEqual(2);
  expect(inWindow, `peek calls in 3 s: ${inWindow}`).toBeLessThanOrEqual(6);
});
