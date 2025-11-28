import { describe, expect, it } from "vitest";
import type { AgentTrace, Mission } from "@sim-corp/schemas";
import { ReportWorker } from "../src/core/worker";
import type { ReportRunner } from "../src/core/runner";
import { KernelClient } from "../src/core/kernel-client";

class FakeKernelClient extends KernelClient {
  public claimed = 0;
  public completed: Array<{ id: string; summary?: Record<string, unknown> }> = [];
  public failed: Array<{ id: string; error: string }> = [];
  public traces: AgentTrace[] = [];
  private missionQueue: Mission[];

  constructor(missions: Mission[]) {
    super({ baseUrl: "http://kernel" });
    this.missionQueue = missions;
  }

  async claimMission(): Promise<Mission | null> {
    this.claimed += 1;
    return this.missionQueue.shift() ?? null;
  }

  async completeMission(id: string, summary?: Record<string, unknown>): Promise<void> {
    this.completed.push({ id, summary });
  }

  async failMission(id: string, error: string): Promise<void> {
    this.failed.push({ id, error });
  }

  async submitTrace(trace: AgentTrace): Promise<void> {
    this.traces.push(trace);
  }
}

class FakeRunner implements ReportRunner {
  constructor(private readonly shouldFail = false) {}
  async run(mission: Mission): Promise<AgentTrace> {
    if (this.shouldFail) {
      throw new Error("boom");
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

const mission: Mission = {
  missionId: "m1",
  goal: { title: "generate-roast-report" },
  params: { sessionId: "s1" },
  constraints: [],
  priority: "MEDIUM",
  context: {}
};

describe("report worker", () => {
  it("claims and completes missions", async () => {
    const kernel = new FakeKernelClient([mission]);
    const runner = new FakeRunner();
    const worker = new ReportWorker({ runner, kernelClient: kernel, pollIntervalMs: 50 });

    await worker.tick();

    expect(kernel.claimed).toBe(1);
    expect(kernel.completed).toHaveLength(1);
    expect(kernel.completed[0]?.summary?.reportId).toBe("r1");
    expect(kernel.traces).toHaveLength(1);
  });

  it("fails missions on error", async () => {
    const kernel = new FakeKernelClient([mission]);
    const runner = new FakeRunner(true);
    const worker = new ReportWorker({ runner, kernelClient: kernel, pollIntervalMs: 50 });

    await worker.tick();

    expect(kernel.failed).toHaveLength(1);
  });
});
