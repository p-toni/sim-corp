import type { AgentTrace, Mission } from "@sim-corp/schemas";
import { KernelClient } from "./kernel-client";
import type { ReportRunner } from "./runner";

const AGENT_NAME = "roast-report-agent";
const GOALS = ["generate-roast-report"];

export interface WorkerStatus {
  lastRunAt?: string;
  lastError?: string;
  processedCount: number;
  running: boolean;
}

export interface ReportWorkerOptions {
  pollIntervalMs?: number;
  kernelClient?: KernelClient;
  runner: ReportRunner;
}

export class ReportWorker {
  private readonly kernel: KernelClient;
  private readonly runner: ReportRunner;
  private readonly pollIntervalMs: number;
  private timer?: ReturnType<typeof setInterval>;
  private lastRunAt?: string;
  private lastError?: string;
  private processedCount = 0;
  private running = false;

  constructor(options: ReportWorkerOptions) {
    this.kernel = options.kernelClient ?? new KernelClient();
    this.runner = options.runner;
    this.pollIntervalMs = options.pollIntervalMs ?? Number(process.env.POLL_INTERVAL_MS ?? 2000);
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
      running: this.running
    };
  }

  private async handleMission(mission: Mission): Promise<void> {
    const missionId = mission.missionId ?? mission.id;
    if (!missionId) {
      throw new Error("Mission missing identifier");
    }
    try {
      const trace = await this.runner.run(mission);
      await this.kernel.submitTrace(trace);
      const reportId = extractReportId(trace);
      const sessionId =
        (mission.params as { sessionId?: string } | undefined)?.sessionId ?? "unknown";
      await this.kernel.completeMission(missionId, { reportId, sessionId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      await this.kernel.failMission(missionId, message);
      throw err;
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
