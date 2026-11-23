import { z } from "zod";

export const PersonSchema = z.object({
  id: z.string().min(1, "ID is required"),
  name: z.string().min(1, "Name is required"),
});
export type Person = z.infer<typeof PersonSchema>;

export const PersonListSchema = z.array(PersonSchema);

export const SessionStateSchema = z.object({
  id: z.string(),
  employee_id: z.string(),
  employee_name: z.string(),
  inspector_id: z.string(),
  inspector_name: z.string(),
  start_time: z.string(),
  end_time: z.string().nullable(),
  ok_count: z.number().int().nonnegative(),
  not_ok_count: z.number().int().nonnegative(),
  last_result: z.string().nullable(),
  last_image_url: z.string().nullable(),
  active: z.boolean(),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const AnalyzeResultLiteral = z.enum(["OK", "NOT OK", "NOT DETECTED"]);
export const CentroidSchema = z.object({
  color: z.string(),
  x: z.number().int(),
  y: z.number().int(),
});
export type Centroid = z.infer<typeof CentroidSchema>;

export const AnalyzeResponseSchema = z.object({
  result: AnalyzeResultLiteral,
  detected_order: z.array(z.string()),
  expected_order: z.array(z.string()),
  image_url: z.string().nullable(),
  ok_count: z.number().int().nonnegative(),
  not_ok_count: z.number().int().nonnegative(),
  centroids: z.array(CentroidSchema).default([]),
});
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>;

export const DailySummarySummarySchema = z.object({
  total_count: z.number().int().nonnegative(),
  pass_count: z.number().int().nonnegative(),
  fail_count: z.number().int().nonnegative(),
  cumulative_pass_rate: z.number(),
});

export const DailySummarySchema = z.object({
  date: z.string(),
  tests: z.array(z.record(z.string(), z.unknown())),
  summary: DailySummarySummarySchema,
});
export type DailySummary = z.infer<typeof DailySummarySchema>;

export const HealthSchema = z.object({ status: z.string() });

export const PeekResponseSchema = z.object({
  ready: z.boolean(),
  detected: z.array(z.string()),
  expected: z.array(z.string()),
});
export type PeekResponse = z.infer<typeof PeekResponseSchema>;

// ---- Chat assistant (POST /api/chat). Every text field comes from a backend
// template, an approved card or a fixed string: the UI only displays it.
export const ChatResponseSchema = z.object({
  kind: z.enum(["data", "card", "action", "refusal", "unknown"]),
  text: z.string(),
  intent: z.string().nullable(),
  reason: z.string().nullable(),
  columns: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
  source: z.string(),
  image_url: z.string().nullable(),
  card: z.object({ id: z.string(), title: z.string(), answer: z.string() }).nullable(),
  action: z
    .object({
      name: z.enum(["export_daily_report", "download_zip"]),
      label: z.string(),
      start: z.string().nullable(),
      end: z.string().nullable(),
    })
    .nullable(),
  suggestions: z.array(z.string()),
  matched_by: z.string().nullable(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;
