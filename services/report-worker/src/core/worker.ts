import type { AgentTrace, Mission, RoastReport } from "@sim-corp/schemas";
import { KernelClient, type MissionRecord } from "./kernel-client";
import type { ReportRunner } from "./runner";
import { IngestionClient } from "./ingestion-client";

const AGENT_NAME = "roast-report-agent";
const GOALS = ["generate-roast-report"];
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_HEARTBEAT_MS = 10_000;

export interface WorkerStatus {
  lastRunAt?: string;
  lastError?: string;
  processedCount: number;
  running: boolean;
  metrics: WorkerMetrics;
}

export interface ReportWorkerOptions {
  pollIntervalMs?: number;
  kernelClient?: KernelClient;
  ingestionClient?: IngestionClient;
  runner: ReportRunner;
  missionTimeoutMs?: number;
  heartbeatIntervalMs?: number;
}

interface WorkerMetrics {
  successes: number;
  failures: number;
  retryableFailures: number;
  alreadyExists: number;
  timeouts: number;
  heartbeatFailures: number;
}

export class ReportWorker {
  private readonly kernel: KernelClient;
  private readonly ingestion?: IngestionClient;
  private readonly runner: ReportRunner;
  private readonly pollIntervalMs: number;
  private readonly missionTimeoutMs: number;
  private readonly heartbeatIntervalMs: number;
  private timer?: ReturnType<typeof setInterval>;
  private lastRunAt?: string;
  private lastError?: string;
  private processedCount = 0;
  private running = false;
  private readonly metrics: WorkerMetrics = {
    successes: 0,
    failures: 0,
    retryableFailures: 0,
    alreadyExists: 0,
    timeouts: 0,
    heartbeatFailures: 0
  };

  constructor(options: ReportWorkerOptions) {
    this.kernel = options.kernelClient ?? new KernelClient();
    this.ingestion = options.ingestionClient;
    this.runner = options.runner;
    this.pollIntervalMs = options.pollIntervalMs ?? Number(process.env.POLL_INTERVAL_MS ?? 5000);
    this.missionTimeoutMs = options.missionTimeoutMs ?? Number(process.env.MISSION_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
    this.heartbeatIntervalMs =
      options.heartbeatIntervalMs ?? Number(process.env.WORKER_HEARTBEAT_MS ?? DEFAULT_HEARTBEAT_MS);
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.lastRunAt = new Date().toISOString();
    try {
      const mission = await this.kernel.claimMission(AGENT_NAME, GOALS);
      if (!mission) {
        this.running = false;
        return;
      }
      await this.handleMission(mission);
      this.processedCount += 1;
      this.lastError = undefined;
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
    } finally {
      this.running = false;
    }
  }

  getStatus(): WorkerStatus {
    return {
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      processedCount: this.processedCount,
      running: this.running,
      metrics: { ...this.metrics }
    };
  }

  private async handleMission(mission: MissionRecord): Promise<void> {
    const missionId = mission.missionId ?? mission.id;
    if (!missionId) {
      throw new Error("Mission missing identifier");
    }
    const leaseId = mission.leaseId;
    const sessionId = (mission.params as { sessionId?: string } | undefined)?.sessionId;
    const existingReport = await this.checkExistingReport(sessionId);
    if (existingReport) {
      await this.kernel.completeMission(missionId, { reportId: existingReport.reportId, sessionId }, leaseId);
      this.metrics.alreadyExists += 1;
      return;
    }

    const stopHeartbeat = this.startHeartbeat(missionId, leaseId);
    try {
      const trace = await this.runWithTimeout(() => this.runner.run(mission), this.missionTimeoutMs);
      await this.kernel.submitTrace(trace);
      const reportId = extractReportId(trace);
      await this.kernel.completeMission(missionId, { reportId, sessionId }, leaseId);
      this.metrics.successes += 1;
    } catch (err) {
      const classification = classifyError(err);
      if (classification.reason === "timeout") {
        this.metrics.timeouts += 1;
      }
      if (classification.retryable) {
        this.metrics.retryableFailures += 1;
      } else {
        this.metrics.failures += 1;
      }
      try {
        await this.kernel.failMission(missionId, classification.message, {
          details: classification.details,
          retryable: classification.retryable,
          leaseId
        });
      } catch (failErr) {
        this.lastError = failErr instanceof Error ? failErr.message : String(failErr);
      }
      throw err;
    } finally {
      stopHeartbeat?.();
    }
  }

  private async checkExistingReport(sessionId?: string): Promise<RoastReport | null> {
    if (!sessionId || !this.ingestion) return null;
    try {
      return await this.ingestion.getLatestReport(sessionId);
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : String(err);
      return null;
    }
  }

  private startHeartbeat(missionId: string, leaseId?: string): (() => void) | null {
    if (!leaseId) return null;
    const beat = async () => {
      try {
        await this.kernel.heartbeatMission(missionId, leaseId, AGENT_NAME);
      } catch (err) {
        this.metrics.heartbeatFailures += 1;
        this.lastError = err instanceof Error ? err.message : String(err);
      }
    };
    void beat();
    const timer = setInterval(() => {
      void beat();
    }, this.heartbeatIntervalMs);
    return () => clearInterval(timer);
  }

  private async runWithTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new TimeoutError("mission timed out")), timeoutMs);
        })
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

function extractReportId(trace: AgentTrace): string | undefined {
  for (const entry of trace.entries ?? []) {
    for (const call of entry.toolCalls ?? []) {
      const output = call.output as { reportId?: string } | undefined;
      if (output?.reportId) {
        return output.reportId;
      }
    }
  }
  return undefined;
}

class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

class TransientError extends Error {
  constructor(message: string, public readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "TransientError";
  }
}

function classifyError(err: unknown): {
  retryable: boolean;
  message: string;
  details?: Record<string, unknown>;
  reason?: string;
} {
  if (err instanceof TimeoutError) {
    return { retryable: true, message: err.message, reason: "timeout" };
  }
  if (err instanceof TransientError) {
    return { retryable: true, message: err.message, details: err.details };
  }
  if (err instanceof Error) {
    if (/ECONN|ENET|FETCH_FAILED|network|timeout/i.test(err.message)) {
      return { retryable: true, message: err.message };
    }
    return { retryable: false, message: err.message };
  }
  return { retryable: false, message: "unknown error" };
}
