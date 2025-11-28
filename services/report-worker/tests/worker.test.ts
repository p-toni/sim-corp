import { describe, expect, it } from "vitest";
import type { AgentTrace, Mission, RoastReport } from "@sim-corp/schemas";
import { ReportWorker } from "../src/core/worker";
import type { ReportRunner } from "../src/core/runner";
import { KernelClient, type MissionRecord } from "../src/core/kernel-client";
import { IngestionClient } from "../src/core/ingestion-client";

class FakeKernelClient extends KernelClient {
  public claimed = 0;
  public completed: Array<{ id: string; summary?: Record<string, unknown>; leaseId?: string }> = [];
  public failed: Array<{ id: string; error: string; retryable?: boolean; leaseId?: string }> = [];
  public heartbeats: Array<{ id: string; leaseId: string }> = [];
  public traces: AgentTrace[] = [];
  private missionQueue: MissionRecord[];

  constructor(missions: MissionRecord[]) {
    super({ baseUrl: "http://kernel" });
    this.missionQueue = missions;
  }

  async claimMission(): Promise<MissionRecord | null> {
    this.claimed += 1;
    const next = this.missionQueue.shift() ?? null;
    if (next && !next.leaseId) {
      next.leaseId = "lease-1";
    }
    return next;
  }

  async completeMission(id: string, summary?: Record<string, unknown>, leaseId?: string): Promise<void> {
    this.completed.push({ id, summary, leaseId });
  }

  async failMission(
    id: string,
    error: string,
    options: { retryable?: boolean; leaseId?: string } = {}
  ): Promise<void> {
    this.failed.push({ id, error, retryable: options.retryable, leaseId: options.leaseId });
  }

  async submitTrace(trace: AgentTrace): Promise<void> {
    this.traces.push(trace);
  }

  async heartbeatMission(id: string, leaseId: string): Promise<void> {
    this.heartbeats.push({ id, leaseId });
  }
}

class FakeIngestionClient extends IngestionClient {
  constructor(private readonly reports: Record<string, RoastReport | null>) {
    super({ baseUrl: "http://ingestion" });
  }

  async getLatestReport(sessionId: string): Promise<RoastReport | null> {
    return this.reports[sessionId] ?? null;
  }
}

class FakeRunner implements ReportRunner {
  public runs = 0;
  constructor(private readonly mode: "ok" | "fail" | "network" | "hang" = "ok") {}
  async run(mission: Mission): Promise<AgentTrace> {
    this.runs += 1;
    if (this.mode === "fail") {
      throw new Error("boom");
    }
    if (this.mode === "network") {
      throw new Error("network unreachable");
    }
    if (this.mode === "hang") {
      return new Promise<AgentTrace>(() => {});
    }
    return {
      missionId: mission.missionId ?? mission.id ?? "m",
      mission,
      traceId: "t1",
      status: "SUCCESS",
      startedAt: new Date(0).toISOString(),
      completedAt: new Date(0).toISOString(),
      entries: [
        {
          missionId: mission.missionId ?? "m",
          loopId: "l1",
          iteration: 0,
          step: "OBSERVE",
          status: "SUCCESS",
          startedAt: new Date(0).toISOString(),
          completedAt: new Date(0).toISOString(),
          toolCalls: [
            {
              toolName: "writeReport",
              input: {},
              output: { reportId: "r1" }
            }
          ],
          metrics: []
        }
      ],
      metadata: { loopId: "l1", iterations: 1 }
    };
  }
}

function buildMission(overrides: Partial<MissionRecord> = {}): MissionRecord {
  const now = new Date(0).toISOString();
  return {
    missionId: "m1",
    id: "m1",
    goal: { title: "generate-roast-report" },
    params: { sessionId: "s1" },
    constraints: [],
    priority: "MEDIUM",
    context: {},
    status: "RUNNING",
    createdAt: now,
    updatedAt: now,
    attempts: 0,
    maxAttempts: 3,
    leaseId: "lease-1",
    ...overrides
  };
}

describe("report worker", () => {
  it("claims and completes missions", async () => {
    const kernel = new FakeKernelClient([buildMission()]);
    const runner = new FakeRunner();
    const worker = new ReportWorker({ runner, kernelClient: kernel, pollIntervalMs: 50 });

    await worker.tick();

    expect(kernel.claimed).toBe(1);
    expect(kernel.completed).toHaveLength(1);
    expect(kernel.completed[0]?.summary?.reportId).toBe("r1");
    expect(kernel.traces).toHaveLength(1);
    expect(kernel.heartbeats.length).toBeGreaterThan(0);
    expect(worker.getStatus().metrics.successes).toBe(1);
  });

  it("fails missions on error", async () => {
    const kernel = new FakeKernelClient([buildMission()]);
    const runner = new FakeRunner("fail");
    const worker = new ReportWorker({ runner, kernelClient: kernel, pollIntervalMs: 50 });

    await worker.tick();

    expect(kernel.failed).toHaveLength(1);
    expect(kernel.failed[0]?.retryable).toBe(false);
  });

  it("retries missions on transient errors", async () => {
    const kernel = new FakeKernelClient([buildMission()]);
    const runner = new FakeRunner("network");
    const worker = new ReportWorker({ runner, kernelClient: kernel, pollIntervalMs: 50 });

    await worker.tick();

    expect(kernel.failed[0]?.retryable).toBe(true);
    expect(worker.getStatus().metrics.retryableFailures).toBe(1);
  });

  it("skips work if a report already exists", async () => {
    const existingReport = {
      reportId: "existing",
      sessionId: "s1",
      reportKind: "POST_ROAST_V1",
      orgId: "o",
      siteId: "s",
      machineId: "m",
      createdAt: new Date(0).toISOString(),
      createdBy: "AGENT",
      analysis: { phases: [], phaseStats: [], crashFlick: { crashDetected: false, flickDetected: false }, sessionId: "s1", orgId: "o", siteId: "s", machineId: "m", computedAt: new Date(0).toISOString() },
      markdown: "# existing"
    } as RoastReport;
    const kernel = new FakeKernelClient([buildMission()]);
    const runner = new FakeRunner();
    const ingestion = new FakeIngestionClient({ s1: existingReport });
    const worker = new ReportWorker({
      runner,
      kernelClient: kernel,
      ingestionClient: ingestion,
      pollIntervalMs: 50
    });

    await worker.tick();

    expect(runner.runs).toBe(0);
    expect(kernel.completed[0]?.summary?.reportId).toBe("existing");
    expect(worker.getStatus().metrics.alreadyExists).toBe(1);
  });

  it("times out long-running missions", async () => {
    const kernel = new FakeKernelClient([buildMission()]);
    const runner = new FakeRunner("hang");
    const worker = new ReportWorker({
      runner,
      kernelClient: kernel,
      pollIntervalMs: 50,
      missionTimeoutMs: 10
    });

    await worker.tick();

    expect(kernel.failed[0]?.retryable).toBe(true);
    expect(worker.getStatus().metrics.timeouts).toBe(1);
  });
});
