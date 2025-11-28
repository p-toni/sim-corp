import {
  EventOverrideSchema,
  RoastAnalysisSchema,
  RoastReportSchema,
  RoastSessionSchema,
  SessionMetaSchema,
  SessionNoteSchema,
  type EventOverride,
  type RoastAnalysis,
  type RoastReport,
  type RoastSession,
  type SessionMeta,
  type SessionNote
} from "@sim-corp/schemas";
import type { ToolRegistry, StepContext } from "@sim-corp/agent-runtime";
import { z } from "zod";

const DEFAULT_INGESTION_URL = "http://127.0.0.1:4001";
const DEFAULT_ANALYTICS_URL = "http://127.0.0.1:4006";

const SessionInputSchema = z.object({ sessionId: z.string() });
const WriteReportInputSchema = z.object({
  sessionId: z.string(),
  report: RoastReportSchema.partial({ reportId: true, createdAt: true, createdBy: true })
});

type Fetcher = <T>(url: string, schema: z.ZodSchema<T>) => Promise<T>;

function setScratch<T>(ctx: StepContext, key: string, value: T): void {
  if (!ctx.scratch) return;
  ctx.scratch[key] = value as unknown;
}

function buildFetcher(): Fetcher {
  return async <T>(url: string, schema: z.ZodSchema<T>): Promise<T> => {
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Request failed ${res.status}: ${body || "unknown error"}`);
    }
    const json = await res.json();
    return schema.parse(json);
  };
}

async function writeJson<T>(url: string, payload: unknown, schema: z.ZodSchema<T>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request failed ${res.status}: ${body || "unknown error"}`);
  }
  const json = await res.json();
  return schema.parse(json);
}

function resolveBaseUrls(config?: { ingestionUrl?: string; analyticsUrl?: string }) {
  const ingestionUrl = config?.ingestionUrl ?? process.env.INGESTION_URL ?? DEFAULT_INGESTION_URL;
  const analyticsUrl = config?.analyticsUrl ?? process.env.ANALYTICS_URL ?? DEFAULT_ANALYTICS_URL;
  return { ingestionUrl, analyticsUrl };
}

function resolveSessionId(input: unknown): string {
  if (typeof input === "string") return input;
  const parsed = SessionInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("sessionId is required");
  }
  return parsed.data.sessionId;
}

export const GET_SESSION_TOOL = "getSession";
export const GET_META_TOOL = "getMeta";
export const GET_NOTES_TOOL = "getNotes";
export const GET_OVERRIDES_TOOL = "getOverrides";
export const GET_ANALYSIS_TOOL = "getAnalysis";
export const WRITE_REPORT_TOOL = "writeReport";

export interface ReportToolsConfig {
  ingestionUrl?: string;
  analyticsUrl?: string;
}

export function createReportTools(config: ReportToolsConfig = {}): ToolRegistry {
  const { ingestionUrl, analyticsUrl } = resolveBaseUrls(config);
  const fetcher = buildFetcher();

  return {
    [GET_SESSION_TOOL]: async (input, ctx): Promise<RoastSession> => {
      const sessionId = resolveSessionId(input);
      const url = `${ingestionUrl.replace(/\/$/, "")}/sessions/${sessionId}`;
      const session = await fetcher(url, RoastSessionSchema);
      setScratch(ctx, "session", session);
      return session;
    },
    [GET_META_TOOL]: async (input, ctx): Promise<SessionMeta> => {
      const sessionId = resolveSessionId(input);
      const url = `${ingestionUrl.replace(/\/$/, "")}/sessions/${sessionId}/meta`;
      const meta = await fetcher(url, SessionMetaSchema);
      setScratch(ctx, "meta", meta);
      return meta;
    },
    [GET_NOTES_TOOL]: async (input, ctx): Promise<SessionNote[]> => {
      const sessionId = resolveSessionId(input);
      const url = `${ingestionUrl.replace(/\/$/, "")}/sessions/${sessionId}/notes`;
      const notes = await fetcher(url, SessionNoteSchema.array());
      setScratch(ctx, "notes", notes);
      return notes;
    },
    [GET_OVERRIDES_TOOL]: async (input, ctx): Promise<EventOverride[]> => {
      const sessionId = resolveSessionId(input);
      const url = `${ingestionUrl.replace(/\/$/, "")}/sessions/${sessionId}/events/overrides`;
      const overrides = await fetcher(url, EventOverrideSchema.array());
      setScratch(ctx, "overrides", overrides);
      return overrides;
    },
    [GET_ANALYSIS_TOOL]: async (input, ctx): Promise<RoastAnalysis> => {
      const sessionId = resolveSessionId(input);
      const url = `${analyticsUrl.replace(/\/$/, "")}/analysis/session/${sessionId}`;
      const analysis = await fetcher(url, RoastAnalysisSchema);
      setScratch(ctx, "analysis", analysis);
      return analysis;
    },
    [WRITE_REPORT_TOOL]: async (input, ctx): Promise<RoastReport> => {
      const parsedInput = WriteReportInputSchema.parse(input);
      const url = `${ingestionUrl.replace(/\/$/, "")}/sessions/${parsedInput.sessionId}/reports`;
      const report = await writeJson(url, parsedInput.report, RoastReportSchema);
      setScratch(ctx, "report", report);
      return report;
    }
  };
}
