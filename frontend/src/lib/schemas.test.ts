import { describe, expect, it } from "vitest";

import {
  AnalyzeResponseSchema,
  DailySummarySchema,
  PersonSchema,
  SessionStateSchema,
} from "./schemas";

describe("PersonSchema", () => {
  it("accepts a well-formed person", () => {
    expect(PersonSchema.parse({ id: "EMP001", name: "Alice" })).toEqual({
      id: "EMP001",
      name: "Alice",
    });
  });

  it("rejects empty id", () => {
    expect(() => PersonSchema.parse({ id: "", name: "Alice" })).toThrow();
  });

  it("rejects empty name", () => {
    expect(() => PersonSchema.parse({ id: "EMP001", name: "" })).toThrow();
  });
});

describe("SessionStateSchema", () => {
  it("round-trips an active session", () => {
    const session = {
      id: "abc",
      employee_id: "E1",
      employee_name: "Alice",
      inspector_id: "I1",
      inspector_name: "Bob",
      start_time: "2026-01-01T08:00:00",
      end_time: null,
      ok_count: 3,
      not_ok_count: 1,
      last_result: "OK",
      last_image_url: "/api/captures/x.jpg",
      active: true,
    };
    expect(SessionStateSchema.parse(session)).toEqual(session);
  });

  it("rejects negative counts", () => {
    expect(() =>
      SessionStateSchema.parse({
        id: "a",
        employee_id: "E",
        employee_name: "n",
        inspector_id: "I",
        inspector_name: "n",
        start_time: "t",
        end_time: null,
        ok_count: -1,
        not_ok_count: 0,
        last_result: null,
        last_image_url: null,
        active: true,
      }),
    ).toThrow();
  });
});

describe("AnalyzeResponseSchema", () => {
  it("only accepts known result literals", () => {
    expect(
      AnalyzeResponseSchema.parse({
        result: "OK",
        detected_order: ["yellow", "green"],
        expected_order: ["yellow", "green"],
        image_url: null,
        ok_count: 1,
        not_ok_count: 0,
      }).result,
    ).toBe("OK");

    expect(() =>
      AnalyzeResponseSchema.parse({
        result: "PASS",
        detected_order: [],
        expected_order: [],
        image_url: null,
        ok_count: 0,
        not_ok_count: 0,
      }),
    ).toThrow();
  });
});

describe("DailySummarySchema", () => {
  it("accepts an empty day", () => {
    const empty = {
      date: "2026-05-15",
      tests: [],
      summary: { total_count: 0, pass_count: 0, fail_count: 0, cumulative_pass_rate: 100 },
    };
    expect(DailySummarySchema.parse(empty)).toEqual(empty);
  });
});
