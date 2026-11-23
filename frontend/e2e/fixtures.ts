import type { Page } from "@playwright/test";

export interface MockState {
  employees: { id: string; name: string }[];
  inspectors: { id: string; name: string }[];
}

export const defaultState = (): MockState => ({
  employees: [
    { id: "EMP001", name: "Alice" },
    { id: "EMP002", name: "Bob" },
  ],
  inspectors: [
    { id: "INS001", name: "Mr. Vinay" },
    { id: "INS002", name: "Mr. Kumar" },
  ],
});

export async function mockApi(page: Page, state: MockState) {
  // Employees
  await page.route("**/api/employees", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.employees),
      });
    }
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() ?? "{}");
      state.employees.push(body);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    }
    return route.fallback();
  });
  await page.route("**/api/employees/*", async (route) => {
    if (route.request().method() === "DELETE") {
      const id = decodeURIComponent(route.request().url().split("/").pop() ?? "");
      state.employees = state.employees.filter((e) => e.id !== id);
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });

  // Inspectors
  await page.route("**/api/inspectors", async (route) => {
    const req = route.request();
    if (req.method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.inspectors),
      });
    }
    if (req.method() === "POST") {
      const body = JSON.parse(req.postData() ?? "{}");
      state.inspectors.push(body);
      return route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    }
    return route.fallback();
  });

  // Admin password check — keep e2e hermetic instead of hitting the real backend.
  await page.route("**/api/auth/verify", async (route) => route.fulfill({ status: 204, body: "" }));

  // Daily summary
  await page.route("**/api/daily/summary", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        date: "2026-05-15",
        tests: [],
        summary: { total_count: 0, pass_count: 0, fail_count: 0, cumulative_pass_rate: 100 },
      }),
    }),
  );

  // Sessions — START/STOP/analyze (minimal so dashboard interactions don't 404)
  await page.route("**/api/sessions/start", async (route) =>
    route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-sid",
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
      }),
    }),
  );

  await page.route("**/api/sessions/*/stop", async (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "test-sid",
        employee_id: "EMP001",
        employee_name: "Alice",
        inspector_id: "INS001",
        inspector_name: "Mr. Vinay",
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        ok_count: 0,
        not_ok_count: 0,
        last_result: null,
        last_image_url: null,
        active: false,
      }),
    }),
  );

  // WebSocket — drop the connection cleanly; the dashboard treats no payloads as "no live updates".
  await page.route("**/ws/session/**", (route) => route.abort());
}
