import { describe, expect, it } from "vitest";
import type { RoastProfile, TelemetryPoint, RoastEvent } from "@sim-corp/schemas";
import { computeRoastPrediction } from "../src/core/prediction";

function buildTelemetry(count: number, withBt = true): TelemetryPoint[] {
  return Array.from({ length: count }, (_, i) => ({
    ts: `2025-01-01T00:00:${String(i).padStart(2, "0")}Z`,
    machineId: "machine-1",
    batchId: "batch-1",
    elapsedSeconds: i * 10,
    btC: withBt ? 90 + i * 3.5 : undefined,
    rorCPerMin: 10 + (i % 4)
  }));
}

const baseProfile: RoastProfile = {
  profileId: "profile-1",
  name: "House",
  version: 1,
  createdAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:00:00.000Z",
  orgId: "org-1",
  machineModel: "SIM",
  targets: {
    firstCrackTempC: 196,
    dropTempC: 210,
    targetDevRatio: 0.2,
    targetDropSeconds: 600
  },
  source: { kind: "MANUAL" }
};

describe("computeRoastPrediction", () => {
  it("produces deterministic results for stable data", () => {
    const telemetry = buildTelemetry(40);
    const events: RoastEvent[] = [];

    const first = computeRoastPrediction({ sessionId: "s1", telemetry, events, atTs: "2025-01-01T00:10:00.000Z" });
    const second = computeRoastPrediction({ sessionId: "s1", telemetry, events, atTs: "2025-01-01T00:10:00.000Z" });

    expect(first.predictedTimes.fcAtElapsedSeconds).toBeCloseTo(second.predictedTimes.fcAtElapsedSeconds ?? 0, 5);
    expect(first.confidence.overall).toBeCloseTo(second.confidence.overall, 5);
  });

  it("anchors predictions to profile targets when provided", () => {
    const telemetry = buildTelemetry(50);
    const events: RoastEvent[] = [];

    const prediction = computeRoastPrediction({ sessionId: "s2", telemetry, events, profile: baseProfile });
    expect(prediction.predictedTimes.dropAtElapsedSeconds).toBeCloseTo(baseProfile.targets.targetDropSeconds ?? 0, 5);
    expect(prediction.inputs.profileId).toBe(baseProfile.profileId);
  });

  it("lowers confidence when telemetry is sparse", () => {
    const rich = computeRoastPrediction({ sessionId: "s3", telemetry: buildTelemetry(40), events: [] });
    const sparse = computeRoastPrediction({ sessionId: "s3", telemetry: buildTelemetry(6, false), events: [] });

    expect(sparse.confidence.overall).toBeLessThan(rich.confidence.overall);
    expect(sparse.confidence.reasons.some((r) => r.toLowerCase().includes("limited"))).toBe(true);
  });

  it("respects observed drop markers", () => {
    const telemetry = buildTelemetry(30);
    const events: RoastEvent[] = [
      { ts: "2025-01-01T00:05:00.000Z", machineId: "machine-1", type: "DROP", payload: { elapsedSeconds: 300 } }
    ];

    const prediction = computeRoastPrediction({ sessionId: "s4", telemetry, events });
    expect(prediction.phase).toBe("POST_DROP");
    expect(prediction.etaSeconds.toDrop).toBeUndefined();
    expect(prediction.predictedTimes.dropAtElapsedSeconds).toBe(300);
  });
});
