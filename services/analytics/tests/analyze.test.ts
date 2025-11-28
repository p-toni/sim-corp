import { describe, expect, it } from "vitest";
import { analyzeSession } from "../src/core/analyze";

describe("analyzeSession", () => {
  it("returns analysis structure", () => {
    const telemetry = [
      { ts: new Date(0).toISOString(), machineId: "m", elapsedSeconds: 0, btC: 120, rorCPerMin: 0 },
      { ts: new Date(300_000).toISOString(), machineId: "m", elapsedSeconds: 300, btC: 198, rorCPerMin: 10 },
      { ts: new Date(600_000).toISOString(), machineId: "m", elapsedSeconds: 600, btC: 210, rorCPerMin: 8 }
    ];
    const events = [
      { ts: telemetry[0].ts, machineId: "m", type: "CHARGE", payload: { elapsedSeconds: 0 } },
      { ts: telemetry[1].ts, machineId: "m", type: "FC", payload: { elapsedSeconds: 300 } },
      { ts: telemetry[2].ts, machineId: "m", type: "DROP", payload: { elapsedSeconds: 600 } }
    ];
    const analysis = analyzeSession({
      sessionId: "s",
      orgId: "o",
      siteId: "s",
      machineId: "m",
      telemetry,
      events
    });
    expect(analysis.sessionId).toBe("s");
    expect(analysis.phases.length).toBeGreaterThan(0);
  });
});
