import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "../src/server";
import type { MqttPublisher, SimTwinClient } from "../src/core/types";
import { SimPublisherManager } from "../src/core/publish";

class StubMqttPublisher implements MqttPublisher {
  async publish(): Promise<void> {}
}

class StubSimTwinClient implements SimTwinClient {
  async runSimulation(): Promise<any> {
    return {
      telemetry: [{ ts: new Date().toISOString(), elapsedSeconds: 0, machineId: "SIM" }],
      events: []
    };
  }
}

describe("sim-publisher routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    const manager = new SimPublisherManager(new StubMqttPublisher(), new StubSimTwinClient());
    server = await buildServer({ logger: false, manager });
  });

  afterEach(async () => {
    await server.close();
  });

  it("starts and stops publishing sessions", async () => {
    const startResponse = await server.inject({
      method: "POST",
      url: "/publish/start",
      payload: {
        orgId: "o",
        siteId: "s",
        machineId: "m",
        batchSizeKg: 5,
        chargeTempC: 180,
        targetFirstCrackSeconds: 480,
        targetDropSeconds: 600,
        maxTempC: 220,
        sampleIntervalSeconds: 1,
        noiseStdDev: 0.5
      }
    });

    expect(startResponse.statusCode).toBe(200);
    const parsed = startResponse.json() as { sessionId: string };
    expect(parsed.sessionId).toBeDefined();

    const stopResponse = await server.inject({
      method: "POST",
      url: "/publish/stop",
      payload: { sessionId: parsed.sessionId }
    });

    expect(stopResponse.statusCode).toBe(200);
    expect(stopResponse.json()).toEqual({ stopped: true });
  });
});
