import { describe, expect, it } from "vitest";
import { InferenceEngine } from "../src/core/engine";
import type { TelemetryEnvelope } from "@sim-corp/schemas";

const key = { orgId: "o", siteId: "s", machineId: "m" };

describe("InferenceEngine", () => {
  it("emits CHARGE then FC then DROP", () => {
    const engine = new InferenceEngine();
    const base: TelemetryEnvelope = {
      ts: new Date(0).toISOString(),
      origin: key,
      topic: "telemetry",
      payload: {
        ts: new Date(0).toISOString(),
        machineId: key.machineId,
        elapsedSeconds: 0,
        btC: 180,
        extras: {}
      }
    };

    const events1 = engine.handleTelemetry(base);
    expect(events1.find((e) => e.type === "CHARGE")).toBeDefined();

    const fcEnvelope: TelemetryEnvelope = {
      ...base,
      ts: new Date(350_000).toISOString(),
      payload: {
        ...base.payload,
        ts: new Date(350_000).toISOString(),
        elapsedSeconds: 350,
        btC: 198,
        extras: {}
      }
    };
    const events2 = engine.handleTelemetry(fcEnvelope);
    expect(events2.find((e) => e.type === "FC")).toBeDefined();

    const drops = engine.tick(new Date(Date.now() + 20_000).toISOString());
    expect(drops.find((d) => d.event.type === "DROP")).toBeDefined();
  });
});
