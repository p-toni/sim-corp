import {
  AgentTrace,
  AgentTraceSchema,
  RoastEvent,
  RoastSession,
  RoastSessionSchema,
  RoastSessionSummary,
  RoastSessionSummarySchema,
  RoastEventSchema,
  TelemetryPoint,
  TelemetryPointSchema,
  RoastAnalysis,
  RoastAnalysisSchema,
  type Mission,
  SessionMeta,
  SessionMetaSchema,
  SessionNote,
  SessionNoteSchema,
  EventOverride,
  EventOverrideSchema,
  RoastReport,
  RoastReportSchema,
  GovernanceDecisionSchema,
  MissionSignalsSchema,
  MissionSchema
} from "@sim-corp/schemas";
import { AgentRuntime } from "@sim-corp/agent-runtime";
import { SimRoastRequestSchema, simulateRoast } from "@sim-corp/sim-twin";
import { runSimRoastMission } from "@sim-corp/sim-roast-runner";
import { simRoastReasoner } from "../../../../agents/sim-roast-runner/src/agent";
import { z } from "zod";

interface SimOutputs {
  telemetry: TelemetryPoint[];
  events: RoastEvent[];
}

const KernelMissionRecordSchema = MissionSchema.extend({
  missionId: z.string().optional(),
  id: z.string().optional(),
  status: z.enum(["PENDING", "RUNNING", "DONE", "FAILED", "RETRY", "QUARANTINED", "BLOCKED", "CANCELED"]),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  nextRetryAt: z.string().optional(),
  governance: GovernanceDecisionSchema.optional(),
  signals: MissionSignalsSchema.optional()
});

export type KernelMissionRecord = z.infer<typeof KernelMissionRecordSchema>;
type MissionSignals = z.infer<typeof MissionSignalsSchema>;

export function extractSimOutputs(trace: AgentTrace): SimOutputs {
  const telemetry: TelemetryPoint[] = [];
  const events: RoastEvent[] = [];

  for (const entry of trace.entries ?? []) {
    for (const call of entry.toolCalls ?? []) {
      const output = call.output;
      if (!output || typeof output !== "object") continue;
      const telemetryCandidate = (output as { telemetry?: unknown }).telemetry;
      const eventsCandidate = (output as { events?: unknown }).events;

      if (telemetryCandidate) {
        const parsedTelemetry = TelemetryPointSchema.array().safeParse(telemetryCandidate);
        if (parsedTelemetry.success) {
          telemetry.push(...parsedTelemetry.data);
        }
      }

      if (eventsCandidate) {
        const parsedEvents = RoastEventSchema.array().safeParse(eventsCandidate);
        if (parsedEvents.success) {
          events.push(...parsedEvents.data);
        }
      }
    }
  }

  return { telemetry, events };
}

const DEFAULT_KERNEL_URL = "http://127.0.0.1:3000";

function getEnv(key: string): string | undefined {
  if (typeof process !== "undefined" && process?.env?.[key]) {
    return process.env[key];
  }
  // Vite exposes env via import.meta.env prefixed by VITE_
  if (typeof import.meta !== "undefined" && import.meta.env) {
    const metaKey = `VITE_${key}`;
    const value = (import.meta.env as Record<string, string | undefined>)[metaKey];
    if (value) return value;
  }
  return undefined;
}

function resolveSimTwinUrl(): string | undefined {
  return getEnv("SIM_TWIN_URL");
}

function resolveKernelUrl(): string {
  return getEnv("KERNEL_URL") ?? DEFAULT_KERNEL_URL;
}

function isNodeLike(): boolean {
  return typeof process !== "undefined" && !!process.versions?.node;
}

function ensureProcessShim(): () => void {
  if (typeof process !== "undefined") {
    return () => {};
  }

  const globalObj = globalThis as Record<string, unknown>;
  if (!globalObj.process) {
    globalObj.process = { env: {} };
    return () => {
      delete globalObj.process;
    };
  }

  return () => {};
}

async function runWithProcessShim<T>(fn: () => Promise<T>): Promise<T> {
  const cleanup = ensureProcessShim();
  try {
    return await fn();
  } finally {
    cleanup();
  }
}

async function withLocalSimTwin<T>(fn: (url: string) => Promise<T>): Promise<T> {
  if (!isNodeLike()) {
    throw new Error("Local sim-twin requires a Node-like runtime");
  }

  // Avoid Vite pre-bundling fastify by deferring import.
  const moduleName = "@sim-corp/sim-twin";
  const mod = await import(/* @vite-ignore */ moduleName);
  const buildServer: typeof import("@sim-corp/sim-twin").buildServer = mod.buildServer;

  const app = await buildServer({ logger: false });
  const address = await app.listen({ port: 0, host: "127.0.0.1" });

  try {
    return await fn(address);
  } finally {
    await app.close();
  }
}

function withSimTwinEnv<T>(url: string, fn: () => Promise<T>): Promise<T> {
  if (typeof process === "undefined") {
    return fn();
  }

  const previous = process.env.SIM_TWIN_URL;
  process.env.SIM_TWIN_URL = url;

  return fn().finally(() => {
    if (previous) {
      process.env.SIM_TWIN_URL = previous;
    } else {
      delete process.env.SIM_TWIN_URL;
    }
  });
}

const ALLOW_POLICY = {
  async check(request: unknown) {
    return {
      request,
      decision: "ALLOW",
      checkedAt: new Date().toISOString(),
      violations: []
    };
  }
};

async function runSimRoastMissionDirect(mission: Mission): Promise<AgentTrace> {
  const cleanupProcess = ensureProcessShim();
  const runtime = new AgentRuntime(
    simRoastReasoner,
    {
      simulateRoast: async (input: unknown) => simulateRoast(SimRoastRequestSchema.parse(input))
    },
    ALLOW_POLICY
  );

  try {
    return await runtime.runMission(mission, {
      maxIterations: 1,
      timeoutMs: 5_000,
      agentId: "sim-roast-runner-local"
    });
  } finally {
    cleanupProcess();
  }
}

export async function runSelfContainedMission(mission: Mission): Promise<AgentTrace> {
  const configuredUrl = resolveSimTwinUrl();

  if (configuredUrl) {
    return runWithProcessShim(() => withSimTwinEnv(configuredUrl, () => runSimRoastMission(mission)));
  }

  if (isNodeLike()) {
    try {
      return await runWithProcessShim(() =>
        withLocalSimTwin((url) => withSimTwinEnv(url, () => runSimRoastMission(mission)))
      );
    } catch (err) {
      // fall back to direct simulation if local server fails
      return runSimRoastMissionDirect(mission);
    }
  }

  return runSimRoastMissionDirect(mission);
}

export async function postTraceToKernel(trace: AgentTrace): Promise<void> {
  const parsed = AgentTraceSchema.safeParse(trace);
  if (!parsed.success) {
    throw new Error("Trace failed schema validation before sending to kernel");
  }

  const url = new URL("/traces", resolveKernelUrl()).toString();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(trace)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Kernel responded ${response.status}: ${message || "unknown error"}`);
  }
}

class HttpError extends Error {
  constructor(message: string, public readonly status?: number) {
    super(message);
    this.name = "HttpError";
  }
}

async function fetchJson<T>(
  url: string,
  schema?: { safeParse: (value: unknown) => { success: boolean; data: T } }
): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new HttpError(`Request failed ${res.status}`, res.status);
  }
  const json = await res.json();
  if (!schema) return json as T;
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Response validation failed");
  }
  return parsed.data;
}

export async function listSessions(baseUrl: string, params: { orgId?: string; siteId?: string; machineId?: string; limit?: number } = {}): Promise<RoastSessionSummary[]> {
  const qs = new URLSearchParams();
  if (params.orgId) qs.append("orgId", params.orgId);
  if (params.siteId) qs.append("siteId", params.siteId);
  if (params.machineId) qs.append("machineId", params.machineId);
  if (typeof params.limit === "number") qs.append("limit", String(params.limit));
  const url = `${baseUrl.replace(/\/$/, "")}/sessions${qs.toString() ? `?${qs.toString()}` : ""}`;
  return fetchJson(url, RoastSessionSummarySchema.array());
}

export async function getSessionTelemetry(baseUrl: string, sessionId: string): Promise<TelemetryPoint[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/sessions/${sessionId}/telemetry`;
  return fetchJson(url, TelemetryPointSchema.array());
}

export async function getSessionEvents(baseUrl: string, sessionId: string): Promise<RoastEvent[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/sessions/${sessionId}/events`;
  return fetchJson(url, RoastEventSchema.array());
}

export async function getSessionSummary(baseUrl: string, sessionId: string): Promise<RoastSession> {
  const url = `${baseUrl.replace(/\/$/, "")}/sessions/${sessionId}`;
  return fetchJson(url, RoastSessionSchema);
}

export async function getSessionAnalysis(analyticsUrl: string, sessionId: string): Promise<RoastAnalysis> {
  const url = `${analyticsUrl.replace(/\/$/, "")}/analysis/session/${sessionId}`;
  return fetchJson(url, RoastAnalysisSchema);
}

export async function getSessionMeta(baseUrl: string, sessionId: string): Promise<SessionMeta> {
  const url = `${baseUrl.replace(/\/$/, "")}/sessions/${sessionId}/meta`;
  return fetchJson(url, SessionMetaSchema);
}

export async function saveSessionMeta(baseUrl: string, sessionId: string, meta: SessionMeta): Promise<SessionMeta> {
  const url = `${baseUrl.replace(/\/$/, "")}/sessions/${sessionId}/meta`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(meta)
  });
  if (!res.ok) {
    throw new HttpError(`Request failed ${res.status}`, res.status);
  }
  const json = await res.json();
  const parsed = SessionMetaSchema.safeParse(json);
  if (!parsed.success) throw new Error("Response validation failed");
  return parsed.data;
}

export async function listSessionNotes(baseUrl: string, sessionId: string, params: { limit?: number; offset?: number } = {}): Promise<SessionNote[]> {
  const qs = new URLSearchParams();
  if (typeof params.limit === "number") qs.set("limit", String(params.limit));
  if (typeof params.offset === "number") qs.set("offset", String(params.offset));
  const url = `${baseUrl.replace(/\/$/, "")}/sessions/${sessionId}/notes${qs.toString() ? `?${qs.toString()}` : ""}`;
  return fetchJson(url, SessionNoteSchema.array());
}

export async function addSessionNote(baseUrl: string, sessionId: string, note: Partial<SessionNote>): Promise<SessionNote> {
  const url = `${baseUrl.replace(/\/$/, "")}/sessions/${sessionId}/notes`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(note)
  });
  if (!res.ok) {
    throw new HttpError(`Request failed ${res.status}`, res.status);
  }
  const json = await res.json();
  const parsed = SessionNoteSchema.safeParse(json);
  if (!parsed.success) throw new Error("Response validation failed");
  return parsed.data;
}

export async function getEventOverrides(baseUrl: string, sessionId: string): Promise<EventOverride[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/sessions/${sessionId}/events/overrides`;
  return fetchJson(url, EventOverrideSchema.array());
}

export async function saveEventOverrides(baseUrl: string, sessionId: string, overrides: EventOverride[]): Promise<EventOverride[]> {
  const url = `${baseUrl.replace(/\/$/, "")}/sessions/${sessionId}/events/overrides`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ overrides })
  });
  if (!res.ok) {
    throw new HttpError(`Request failed ${res.status}`, res.status);
  }
  const json = await res.json();
  const parsed = EventOverrideSchema.array().safeParse(json);
  if (!parsed.success) throw new Error("Response validation failed");
  return parsed.data;
}

export async function getLatestSessionReport(baseUrl: string, sessionId: string): Promise<RoastReport | null> {
  const url = `${baseUrl.replace(/\/$/, "")}/sessions/${sessionId}/reports/latest`;
  const res = await fetch(url);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new HttpError(`Request failed ${res.status}`, res.status);
  }
  const json = await res.json();
  const parsed = RoastReportSchema.safeParse(json);
  if (!parsed.success) throw new Error("Response validation failed");
  return parsed.data;
}

export async function enqueueReportMission(
  sessionId: string,
  context?: { orgId?: string; siteId?: string; machineId?: string },
  signals?: MissionSignals
): Promise<void> {
  const payload = {
    goal: "generate-roast-report",
    params: { sessionId, reportKind: "POST_ROAST_V1" },
    idempotencyKey: `generate-roast-report:POST_ROAST_V1:${sessionId}`,
    subjectId: sessionId,
    ...(context ? { context } : {}),
    ...(signals ? { signals } : {})
  };
  const res = await fetch(new URL("/missions", resolveKernelUrl()).toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok && res.status !== 200 && res.status !== 201) {
    const message = await res.text().catch(() => "unknown error");
    throw new HttpError(message || "Failed to enqueue mission", res.status);
  }
}

export async function listMissionsBySubject(subjectId: string, goal = "generate-roast-report"): Promise<KernelMissionRecord[]> {
  const url = new URL("/missions", resolveKernelUrl());
  url.searchParams.set("subjectId", subjectId);
  if (goal) {
    url.searchParams.set("goal", goal);
  }
  return fetchJson(url.toString(), KernelMissionRecordSchema.array());
}

export async function approveMission(missionId: string): Promise<KernelMissionRecord> {
  const url = new URL(`/missions/${missionId}/approve`, resolveKernelUrl()).toString();
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const message = await res.text().catch(() => "unknown error");
    throw new HttpError(message || "Approval failed", res.status);
  }
  const json = await res.json();
  const parsed = KernelMissionRecordSchema.safeParse(json);
  if (!parsed.success) throw new Error("Response validation failed");
  return parsed.data;
}
