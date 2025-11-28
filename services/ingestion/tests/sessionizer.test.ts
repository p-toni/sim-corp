import { describe, expect, it } from "vitest";
import { Sessionizer } from "../src/core/sessionizer";
import type { TelemetryEnvelope } from "@sim-corp/schemas";

const baseEnvelope: TelemetryEnvelope = {
  ts: new Date(0).toISOString(),
  origin: { orgId: "o", siteId: "s", machineId: "m" },
  topic: "telemetry",
  payload: {
    ts: new Date(0).toISOString(),
    machineId: "m",
    elapsedSeconds: 0,
    btC: 180
  }
};

describe("Sessionizer", () => {
  it("reuses session within gap and creates new after gap", () => {
    const sessionizer = new Sessionizer({ sessionGapSeconds: 1 });
    const first = sessionizer.assignSession(baseEnvelope);
    const second = sessionizer.assignSession({
      ...baseEnvelope,
      ts: new Date(500).toISOString(),
      payload: { ...baseEnvelope.payload, ts: new Date(500).toISOString(), elapsedSeconds: 0.5 }
    });
    expect(second.sessionId).toBe(first.sessionId);

    const third = sessionizer.assignSession({
      ...baseEnvelope,
      ts: new Date(2000).toISOString(),
      payload: { ...baseEnvelope.payload, ts: new Date(2000).toISOString(), elapsedSeconds: 2 }
    });
    expect(third.sessionId).not.toBe(first.sessionId);
  });

  it("closes on drop", () => {
    const sessionizer = new Sessionizer({ sessionGapSeconds: 10 });
    const env = sessionizer.assignSession(baseEnvelope);
    sessionizer.handleEvent({
      ...env,
      topic: "event",
      payload: { ts: env.ts, machineId: "m", type: "DROP" }
    });
    const ticked = sessionizer.tick(new Date(Date.now() + 20000).toISOString());
    expect(ticked.length).toBe(0);
  });
});
