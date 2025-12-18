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
  MissionSchema,
  RoastProfile,
  RoastProfileSchema,
  RoastProfileVersion,
  RoastProfileVersionSchema,
  RoastProfileExportBundleSchema,
  RoastPrediction,
  RoastPredictionSchema
} from "@sim-corp/schemas";
import { AgentRuntime } from "@sim-corp/agent-runtime";
import { SimRoastRequestSchema, simulateRoast } from "@sim-corp/sim-twin";
import { runSimRoastMission } from "@sim-corp/sim-roast-runner";
import { simRoastReasoner } from "../../../../agents/sim-roast-runner/src/agent";
import { z } from "zod";
import { defaultEndpointSettings, getEndpointSettings } from "./settings";

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

const KernelMissionListSchema = z.object({
  items: KernelMissionRecordSchema.array(),
  nextCursor: z.string().optional()
});

export type KernelMissionRecord = z.infer<typeof KernelMissionRecordSchema>;
type MissionSignals = z.infer<typeof MissionSignalsSchema>;

export interface MissionListFilters {
  status?: string | string[];
  goal?: string;
  subjectId?: string;
  orgId?: string;
  siteId?: string;
  machineId?: string;
  limit?: number;
}

export interface ProfileListFilters {
  orgId: string;
  siteId?: string;
  machineModel?: string;
  q?: string;
  tag?: string;
  includeArchived?: boolean;
  limit?: number;
}

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
  return getEndpointSettings().kernelUrl || defaultEndpointSettings.kernelUrl;
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

export async function getSessionAnalysis(analyticsUrl: string | undefined, sessionId: string): Promise<RoastAnalysis> {
  const base = (analyticsUrl ?? getEndpointSettings().analyticsUrl ?? defaultEndpointSettings.analyticsUrl).replace(/\/$/, "");
  const url = `${base}/analysis/session/${sessionId}`;
  return fetchJson(url, RoastAnalysisSchema);
}

export async function getPrediction(
  analyticsUrl: string | undefined,
  sessionId: string,
  params: { orgId: string; profileId?: string }
): Promise<RoastPrediction> {
  const qs = new URLSearchParams({ orgId: params.orgId });
  if (params.profileId) qs.set("profileId", params.profileId);
  const base = (analyticsUrl ?? getEndpointSettings().analyticsUrl ?? defaultEndpointSettings.analyticsUrl).replace(/\/$/, "");
  const url = `${base}/prediction/session/${sessionId}?${qs.toString()}`;
  return fetchJson(url, RoastPredictionSchema);
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

export async function listMissions(filters: MissionListFilters = {}): Promise<z.infer<typeof KernelMissionListSchema>> {
  const url = new URL("/missions", resolveKernelUrl());
  if (filters.status) {
    const statusValue = Array.isArray(filters.status) ? filters.status.join(",") : filters.status;
    url.searchParams.set("status", statusValue);
  }
  if (filters.goal) url.searchParams.set("goal", filters.goal);
  if (filters.subjectId) url.searchParams.set("subjectId", filters.subjectId);
  if (filters.orgId) url.searchParams.set("orgId", filters.orgId);
  if (filters.siteId) url.searchParams.set("siteId", filters.siteId);
  if (filters.machineId) url.searchParams.set("machineId", filters.machineId);
  if (typeof filters.limit === "number") url.searchParams.set("limit", String(filters.limit));
  return fetchJson(url.toString(), KernelMissionListSchema);
}

export async function getMission(missionId: string): Promise<KernelMissionRecord> {
  const url = new URL(`/missions/${missionId}`, resolveKernelUrl()).toString();
  return fetchJson(url, KernelMissionRecordSchema);
}

export async function listMissionsBySubject(subjectId: string, goal = "generate-roast-report"): Promise<KernelMissionRecord[]> {
  const list = await listMissions({ subjectId, goal });
  return list.items;
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

export async function cancelMission(missionId: string): Promise<KernelMissionRecord> {
  const url = new URL(`/missions/${missionId}/cancel`, resolveKernelUrl()).toString();
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const message = await res.text().catch(() => "unknown error");
    throw new HttpError(message || "Cancel failed", res.status);
  }
  const json = await res.json();
  const parsed = KernelMissionRecordSchema.safeParse(json);
  if (!parsed.success) throw new Error("Response validation failed");
  return parsed.data;
}

export async function retryNowMission(missionId: string): Promise<KernelMissionRecord> {
  const url = new URL(`/missions/${missionId}/retryNow`, resolveKernelUrl()).toString();
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const message = await res.text().catch(() => "unknown error");
    throw new HttpError(message || "Retry failed", res.status);
  }
  const json = await res.json();
  const parsed = KernelMissionRecordSchema.safeParse(json);
  if (!parsed.success) throw new Error("Response validation failed");
  return parsed.data;
}

export async function listProfiles(baseUrl: string, filters: ProfileListFilters): Promise<RoastProfile[]> {
  const base = baseUrl.replace(/\/$/, "");
  const params = new URLSearchParams();
  params.set("orgId", filters.orgId);
  if (filters.siteId) params.set("siteId", filters.siteId);
  if (filters.machineModel) params.set("machineModel", filters.machineModel);
  if (filters.q) params.set("q", filters.q);
  if (filters.tag) params.set("tag", filters.tag);
  if (filters.includeArchived) params.set("includeArchived", "true");
  if (typeof filters.limit === "number") params.set("limit", String(filters.limit));
  const res = await fetch(`${base}/profiles?${params.toString()}`);
  const json = await res.json();
  const parsed = RoastProfileSchema.array().safeParse(json);
  if (!parsed.success) {
    throw new Error("Failed to parse profiles");
  }
  return parsed.data;
}

export async function getProfile(baseUrl: string, orgId: string, profileId: string): Promise<RoastProfile> {
  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/profiles/${profileId}?orgId=${orgId}`);
  const json = await res.json();
  const parsed = RoastProfileSchema.safeParse(json);
  if (!parsed.success) throw new Error("Failed to parse profile");
  return parsed.data;
}

export async function listProfileVersions(
  baseUrl: string,
  orgId: string,
  profileId: string
): Promise<RoastProfileVersion[]> {
  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/profiles/${profileId}/versions?orgId=${orgId}`);
  const json = await res.json();
  const parsed = RoastProfileVersionSchema.array().safeParse(json);
  if (!parsed.success) throw new Error("Failed to parse profile versions");
  return parsed.data;
}

export async function createProfile(
  baseUrl: string,
  profile: Partial<RoastProfile>,
  changeNote?: string
): Promise<RoastProfile> {
  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/profiles`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile, changeNote })
  });
  const json = await res.json();
  const parsed = RoastProfileSchema.safeParse(json);
  if (!parsed.success) throw new Error("Failed to parse created profile");
  return parsed.data;
}

export async function createProfileVersion(
  baseUrl: string,
  profileId: string,
  profile: Partial<RoastProfile>,
  changeNote?: string
): Promise<RoastProfile> {
  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/profiles/${profileId}/new-version`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile, changeNote })
  });
  const json = await res.json();
  const parsed = RoastProfileSchema.safeParse(json);
  if (!parsed.success) throw new Error("Failed to parse profile version");
  return parsed.data;
}

export async function toggleArchiveProfile(
  baseUrl: string,
  orgId: string,
  profileId: string,
  archived: boolean
): Promise<RoastProfile> {
  const base = baseUrl.replace(/\/$/, "");
  const path = archived ? "archive" : "unarchive";
  const res = await fetch(`${base}/profiles/${profileId}/${path}?orgId=${orgId}`, { method: "POST" });
  const json = await res.json();
  const parsed = RoastProfileSchema.safeParse(json);
  if (!parsed.success) throw new Error("Failed to parse archived profile");
  return parsed.data;
}

export async function exportProfile(
  baseUrl: string,
  orgId: string,
  profileId: string,
  format: "json" | "csv"
): Promise<RoastProfileExportBundle | string> {
  const base = baseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/profiles/${profileId}/export?orgId=${orgId}&format=${format}`);
  if (format === "csv") {
    return res.text();
  }
  const json = await res.json();
  const parsed = RoastProfileExportBundleSchema.safeParse(json);
  if (!parsed.success) throw new Error("Failed to parse export bundle");
  return parsed.data;
}

export async function getGovernorConfig(): Promise<unknown> {
  const url = new URL("/governor/config", resolveKernelUrl()).toString();
  return fetchJson(url);
}

export async function getDispatcherStatus(baseUrl: string): Promise<unknown> {
  const base = baseUrl.replace(/\/$/, "");
  return fetchJson(`${base}/status`);
}
