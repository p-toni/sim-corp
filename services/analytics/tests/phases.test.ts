import { describe, expect, it } from "vitest";
import { derivePhases } from "../src/core/phases";
import { DEFAULT_CONFIG } from "../src/core/config";

const telemetry = [
  { ts: new Date(0).toISOString(), machineId: "m", elapsedSeconds: 0, btC: 120 },
  { ts: new Date(60_000).toISOString(), machineId: "m", elapsedSeconds: 60, btC: 151 },
  { ts: new Date(300_000).toISOString(), machineId: "m", elapsedSeconds: 300, btC: 200 },
  { ts: new Date(600_000).toISOString(), machineId: "m", elapsedSeconds: 600, btC: 210 }
];

describe("derivePhases", () => {
  it("computes phases using events", () => {
    const { phases, chargeSeconds, fcSeconds, dropSeconds } = derivePhases({
      telemetry,
      events: [
        { ts: telemetry[0].ts, machineId: "m", type: "CHARGE", payload: { elapsedSeconds: 0 } },
        { ts: telemetry[2].ts, machineId: "m", type: "FC", payload: { elapsedSeconds: 300 } },
        { ts: telemetry[3].ts, machineId: "m", type: "DROP", payload: { elapsedSeconds: 600 } }
      ],
      config: DEFAULT_CONFIG
    });
    expect(chargeSeconds).toBe(0);
    expect(fcSeconds).toBe(300);
    expect(dropSeconds).toBe(600);
    expect(phases.length).toBeGreaterThan(0);
  });
});
