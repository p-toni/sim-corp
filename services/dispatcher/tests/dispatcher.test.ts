import { describe, expect, it } from "vitest";
import type { SessionClosedEvent } from "@sim-corp/schemas";
import { Dispatcher } from "../src/core/dispatcher";
import type { MissionRequest, MissionResult } from "../src/core/kernel-client";

class FakeKernel {
  public readonly calls: MissionRequest[] = [];
  constructor(private readonly result: MissionResult = "created", private readonly shouldThrow = false) {}

  async createMission(input: MissionRequest): Promise<MissionResult> {
    if (this.shouldThrow) {
      throw new Error("kernel down");
    }
    this.calls.push(input);
    return this.result;
  }
}

const baseEvent: SessionClosedEvent = {
  type: "session.closed",
  version: 1,
  emittedAt: "2024-01-01T00:00:00.000Z",
  orgId: "o1",
  siteId: "s1",
  machineId: "m1",
  sessionId: "sess-1",
  reportKind: "POST_ROAST_V1"
};

describe("Dispatcher", () => {
  it("creates mission with idempotency key", async () => {
    const kernel = new FakeKernel();
    const dispatcher = new Dispatcher({ kernel, goals: ["generate-roast-report"] });

    await dispatcher.handleMessage("ops/o1/s1/m1/session/closed", Buffer.from(JSON.stringify(baseEvent)));

    expect(kernel.calls).toHaveLength(1);
    expect(kernel.calls[0]?.idempotencyKey).toBe("generate-roast-report:POST_ROAST_V1:sess-1");
    expect(kernel.calls[0]?.subjectId).toBe(baseEvent.sessionId);
    expect((kernel.calls[0]?.signals as { session?: { closeReason?: string } })?.session?.closeReason).toBe("SILENCE_CLOSE");
    const status = dispatcher.getStatus();
    expect(status.counters.missionsCreated).toBe(1);
  });

  it("increments parse errors on invalid JSON", async () => {
    const kernel = new FakeKernel();
    const dispatcher = new Dispatcher({ kernel });

    await dispatcher.handleMessage("ops/o1/s1/m1/session/closed", Buffer.from("not-json"));

    const status = dispatcher.getStatus();
    expect(status.counters.eventsReceived).toBe(1);
    expect(status.counters.parseErrors).toBe(1);
  });

  it("increments validation errors on schema failure", async () => {
    const kernel = new FakeKernel();
    const dispatcher = new Dispatcher({ kernel });

    await dispatcher.handleMessage(
      "ops/o1/s1/m1/session/closed",
      Buffer.from(JSON.stringify({ type: "session.closed", version: 1 }))
    );

    const status = dispatcher.getStatus();
    expect(status.counters.validationErrors).toBe(1);
    expect(status.counters.missionsCreated).toBe(0);
  });

  it("tracks kernel errors", async () => {
    const kernel = new FakeKernel("created", true);
    const dispatcher = new Dispatcher({ kernel });

    await dispatcher.handleMessage("ops/o1/s1/m1/session/closed", Buffer.from(JSON.stringify(baseEvent)));

    const status = dispatcher.getStatus();
    expect(status.counters.kernelErrors).toBe(1);
    expect(status.lastErrors.length).toBeGreaterThan(0);
  });
});
