import { AgentTrace, AgentTraceEntry, EventOverride, Mission, SessionMeta, SessionNote } from "@sim-corp/schemas";

export interface SimMissionParams {
  targetFirstCrackSeconds: number;
  targetDropSeconds: number;
  seed: number;
  noiseStdDev: number;
  sampleIntervalSeconds: number;
}

export const defaultMissionParams: SimMissionParams = {
  targetFirstCrackSeconds: 500,
  targetDropSeconds: 650,
  seed: 42,
  noiseStdDev: 0.5,
  sampleIntervalSeconds: 2
};

export type AppMode = "batch" | "live" | "playback";
export type PlaybackMode = "playback";

export interface LiveConfig {
  ingestionUrl: string;
  orgId: string;
  siteId: string;
  machineId: string;
}

export const defaultLiveConfig: LiveConfig = {
  ingestionUrl: "http://127.0.0.1:4001",
  orgId: "org",
  siteId: "site",
  machineId: "SIM-MACHINE"
};

export interface PlaybackState {
  sessions: Array<{
    id: string;
    label: string;
    startedAt: string;
    status: string;
  }>;
  selectedSessionId: string | null;
  summary?: {
    startedAt?: string;
    endedAt?: string | null;
    durationSeconds?: number;
    maxBtC?: number;
    fcSeconds?: number;
    dropSeconds?: number;
  };
}

export interface QcState {
  meta: SessionMeta | null;
  overrides: EventOverride[];
  notes: SessionNote[];
}

export interface AnalysisState {
  metrics?: {
    totalDurationSeconds?: number;
    fcSeconds?: number;
    dropSeconds?: number;
    developmentRatio?: number;
    maxBtC?: number;
    endBtC?: number;
  };
  warnings: { code: string; severity: string; message: string }[];
  recommendations: { code: string; message: string; confidence: string }[];
  phases: Array<{ startSeconds: number; endSeconds: number; phase: string }>;
}

function numeric(value: number | string): number {
  if (typeof value === "number") {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeParams(params: SimMissionParams): SimMissionParams {
  return {
    targetFirstCrackSeconds: Math.max(1, numeric(params.targetFirstCrackSeconds)),
    targetDropSeconds: Math.max(1, numeric(params.targetDropSeconds)),
    seed: Math.round(numeric(params.seed)),
    noiseStdDev: Math.max(0, numeric(params.noiseStdDev)),
    sampleIntervalSeconds: Math.max(0.5, numeric(params.sampleIntervalSeconds))
  };
}

export function buildMissionFromParams(params: SimMissionParams): Mission {
  const normalized = normalizeParams(params);
  return {
    missionId: `roast-${crypto.randomUUID?.() ?? String(Date.now())}`,
    goal: {
      title: "simulate-roast",
      description: "Run simulated roast for desktop UI"
    },
    constraints: [],
    context: { environment: "SIM" },
    priority: "MEDIUM",
    params: normalized,
    createdAt: new Date().toISOString()
  };
}

export function stepIdForEntry(entry: AgentTraceEntry, index: number): string {
  const iteration = entry.iteration ?? 0;
  return `${iteration}:${entry.step}:${index}`;
}

export type MissionRunner = (mission: Mission) => Promise<AgentTrace>;

export function appendWithLimit<T>(buffer: T[], item: T, limit = 2000): T[] {
  const next = [...buffer, item];
  if (next.length > limit) {
    return next.slice(next.length - limit);
  }
  return next;
}
