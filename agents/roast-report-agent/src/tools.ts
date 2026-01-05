import {
  EventOverrideSchema,
  RoastAnalysisSchema,
  RoastReportSchema,
  RoastSessionSchema,
  SessionMetaSchema,
  SessionNoteSchema,
  EvalRunSchema,
  type EventOverride,
  type RoastAnalysis,
  type RoastReport,
  type RoastSession,
  type SessionMeta,
  type SessionNote,
  type EvalRun
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

function resolveBaseUrls(config?: { ingestionUrl?: string; analyticsUrl?: string; evalUrl?: string }) {
  const ingestionUrl = config?.ingestionUrl ?? process.env.INGESTION_URL ?? DEFAULT_INGESTION_URL;
  const analyticsUrl = config?.analyticsUrl ?? process.env.ANALYTICS_URL ?? DEFAULT_ANALYTICS_URL;
  const evalUrl = config?.evalUrl ?? process.env.EVAL_SERVICE_URL ?? "http://127.0.0.1:4007";
  return { ingestionUrl, analyticsUrl, evalUrl };
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
export const GET_EVALUATIONS_TOOL = "getEvaluations";
export const WRITE_REPORT_TOOL = "writeReport";

export interface ReportToolsConfig {
  ingestionUrl?: string;
  analyticsUrl?: string;
  evalUrl?: string;
}

export function createReportTools(config: ReportToolsConfig = {}): ToolRegistry {
  const { ingestionUrl, analyticsUrl, evalUrl } = resolveBaseUrls(config);
  const fetcher = buildFetcher();

  return {
    [GET_SESSION_TOOL]: async (input, ctx): Promise<RoastSession> => {
      const sessionId = resolveSessionId(input);
      const url = `${ingestionUrl.replace(/\/$/, "")}/sessions/${sessionId}`;
      const session = normalizeSession(await fetcher(url, RoastSessionSchema));
      setScratch(ctx, "session", session);
      return session;
    },
    [GET_META_TOOL]: async (input, ctx): Promise<SessionMeta> => {
      const sessionId = resolveSessionId(input);
      const url = `${ingestionUrl.replace(/\/$/, "")}/sessions/${sessionId}/meta`;
      const meta = normalizeMeta(await fetcher(url, SessionMetaSchema));
      setScratch(ctx, "meta", meta);
      return meta;
    },
    [GET_NOTES_TOOL]: async (input, ctx): Promise<SessionNote[]> => {
      const sessionId = resolveSessionId(input);
      const url = `${ingestionUrl.replace(/\/$/, "")}/sessions/${sessionId}/notes`;
      const notes = normalizeNotes(await fetcher(url, SessionNoteSchema.array()));
      setScratch(ctx, "notes", notes);
      return notes;
    },
    [GET_OVERRIDES_TOOL]: async (input, ctx): Promise<EventOverride[]> => {
      const sessionId = resolveSessionId(input);
      const url = `${ingestionUrl.replace(/\/$/, "")}/sessions/${sessionId}/events/overrides`;
      const overrides = normalizeOverrides(await fetcher(url, EventOverrideSchema.array()));
      setScratch(ctx, "overrides", overrides);
      return overrides;
    },
    [GET_ANALYSIS_TOOL]: async (input, ctx): Promise<RoastAnalysis> => {
      const sessionId = resolveSessionId(input);
      const url = `${analyticsUrl.replace(/\/$/, "")}/analysis/session/${sessionId}`;
      const analysis = normalizeAnalysis(await fetcher(url, RoastAnalysisSchema));
      setScratch(ctx, "analysis", analysis);
      return analysis;
    },
    [GET_EVALUATIONS_TOOL]: async (input, ctx): Promise<EvalRun[]> => {
      const sessionId = resolveSessionId(input);
      const url = `${evalUrl.replace(/\/$/, "")}/evaluations?sessionId=${encodeURIComponent(sessionId)}`;
      try {
        const evaluations = await fetcher(url, EvalRunSchema.array());
        setScratch(ctx, "evaluations", evaluations);
        return evaluations;
      } catch (err) {
        // Eval service might not be available or no evaluations exist
        setScratch(ctx, "evaluations", []);
        return [];
      }
    },
    [WRITE_REPORT_TOOL]: async (input, ctx): Promise<RoastReport> => {
      const parsedInput = WriteReportInputSchema.parse(input);
      const url = `${ingestionUrl.replace(/\/$/, "")}/sessions/${parsedInput.sessionId}/reports`;
      const rawReport = (await writeJson(
        url,
        parsedInput.report as RoastReport,
        RoastReportSchema
      )) as RoastReport;
      const report = normalizeReport(rawReport);
      setScratch(ctx, "report", report);
      return report;
    }
  };
}

function normalizeSession(session: unknown): RoastSession {
  const data = session as RoastSession & { meta?: Record<string, unknown> };
  return { ...data, meta: data.meta ?? {} };
}

function normalizeMeta(meta: unknown): SessionMeta {
  const data = meta as SessionMeta & { tags?: string[]; extra?: Record<string, unknown> };
  return {
    ...data,
    tags: data.tags ?? [],
    extra: data.extra ?? {}
  };
}

function normalizeNotes(notes: unknown): SessionNote[] {
  const list = (notes as Array<SessionNote & { defects?: SessionNote["defects"]; extra?: Record<string, unknown> }>) ?? [];
  return list.map((note) => ({
    ...note,
    defects: note.defects ?? [],
    extra: note.extra ?? {}
  }));
}

function normalizeOverrides(overrides: unknown): EventOverride[] {
  const list = (overrides as Array<EventOverride & { source?: EventOverride["source"] }>) ?? [];
  return list.map((o) => ({
    ...o,
    source: o.source ?? "HUMAN"
  }));
}

function normalizeAnalysis(analysis: unknown): RoastAnalysis {
  const data = analysis as RoastAnalysis;
  return {
    ...data,
    crashFlick: { ...data.crashFlick, details: data.crashFlick.details ?? {} }
  };
}

function normalizeReport(report: RoastReport): RoastReport {
  return {
    ...report,
    notes: report.notes ?? [],
    overrides: report.overrides ?? [],
    nextActions: report.nextActions ?? []
  };
}
