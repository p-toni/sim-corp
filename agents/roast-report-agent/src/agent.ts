import type { LoopStep, Reasoner, StepContext, StepOutput } from "@sim-corp/agent-runtime";
import type {
  EventOverride,
  Mission,
  RoastAnalysis,
  RoastReport,
  RoastSession,
  SessionMeta,
  SessionNote
} from "@sim-corp/schemas";
import {
  GET_ANALYSIS_TOOL,
  GET_META_TOOL,
  GET_NOTES_TOOL,
  GET_OVERRIDES_TOOL,
  GET_SESSION_TOOL,
  WRITE_REPORT_TOOL
} from "./tools";
import { renderReport } from "./template";

const AGENT_NAME = "roast-report-agent";
const AGENT_VERSION = "0.0.1";

interface ReportAgentState {
  sessionId?: string;
  ingestionUrl?: string;
  analyticsUrl?: string;
  report?: RoastReport;
}

function mergeState(ctx: StepContext, patch: Partial<ReportAgentState>): ReportAgentState {
  return { ...(ctx.state as ReportAgentState), ...patch };
}

function getSessionIdFromMission(mission: Mission): string {
  const candidate = (mission.params as { sessionId?: unknown } | undefined)?.sessionId;
  if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
  throw new Error("mission.params.sessionId is required");
}

function getScratch<T>(ctx: StepContext, key: string): T | undefined {
  return (ctx.scratch?.[key] as T | undefined) ?? undefined;
}

function getRequired<T>(ctx: StepContext, key: string): T {
  const value = getScratch<T>(ctx, key);
  if (value === undefined) {
    throw new Error(`Missing ${key} in scratch state`);
  }
  return value;
}

function buildReport(ctx: StepContext): RoastReport {
  const session = getRequired<RoastSession>(ctx, "session");
  const analysis = getRequired<RoastAnalysis>(ctx, "analysis");
  const meta = getScratch<SessionMeta>(ctx, "meta");
  const notes = getScratch<SessionNote[]>(ctx, "notes") ?? [];
  const overrides = getScratch<EventOverride[]>(ctx, "overrides") ?? [];
  const { markdown, nextActions } = renderReport({
    session,
    analysis,
    meta: meta ?? undefined,
    overrides,
    notes,
    agentName: AGENT_NAME,
    agentVersion: AGENT_VERSION
  });

  return {
    reportId: `R-${session.sessionId}-${Date.now()}`,
    sessionId: session.sessionId,
    orgId: session.orgId,
    siteId: session.siteId,
    machineId: session.machineId,
    createdAt: new Date().toISOString(),
    createdBy: "AGENT",
    agentName: AGENT_NAME,
    agentVersion: AGENT_VERSION,
    analysis,
    meta: meta ?? undefined,
    overrides,
    notes,
    markdown,
    nextActions
  };
}

async function handleGetMission(ctx: StepContext): Promise<StepOutput> {
  const sessionId = getSessionIdFromMission(ctx.mission);
  return { state: mergeState(ctx, { sessionId }), notes: "mission loaded" };
}

async function handleScan(ctx: StepContext): Promise<StepOutput> {
  const ingestionUrl = process.env.INGESTION_URL ?? "http://127.0.0.1:4001";
  const analyticsUrl = process.env.ANALYTICS_URL ?? "http://127.0.0.1:4006";
  return { state: mergeState(ctx, { ingestionUrl, analyticsUrl }), notes: "env scanned" };
}

async function handleThink(ctx: StepContext): Promise<StepOutput> {
  return { state: { ...ctx.state }, notes: "fetch plan prepared" };
}

async function handleAct(ctx: StepContext): Promise<StepOutput> {
  const sessionId = (ctx.state as ReportAgentState).sessionId;
  if (!sessionId) {
    throw new Error("sessionId missing from state");
  }

  return {
    state: { ...ctx.state },
    toolInvocations: [
      { toolName: GET_SESSION_TOOL, input: { sessionId } },
      { toolName: GET_META_TOOL, input: { sessionId } },
      { toolName: GET_NOTES_TOOL, input: { sessionId } },
      { toolName: GET_OVERRIDES_TOOL, input: { sessionId } },
      { toolName: GET_ANALYSIS_TOOL, input: { sessionId } }
    ],
    notes: "fetching inputs"
  };
}

async function handleObserve(ctx: StepContext): Promise<StepOutput> {
  const report = buildReport(ctx);
  return {
    state: mergeState(ctx, { report }),
    toolInvocations: [
      {
        toolName: WRITE_REPORT_TOOL,
        input: {
          sessionId: report.sessionId,
          report
        }
      }
    ],
    notes: "report generated",
    done: true
  };
}

export const roastReportReasoner: Reasoner = {
  async runStep(step: LoopStep, ctx: StepContext): Promise<StepOutput> {
    switch (step) {
      case "GET_MISSION":
        return handleGetMission(ctx);
      case "SCAN":
        return handleScan(ctx);
      case "THINK":
        return handleThink(ctx);
      case "ACT":
        return handleAct(ctx);
      case "OBSERVE":
        return handleObserve(ctx);
      default:
        return { state: { ...ctx.state } };
    }
  }
};
