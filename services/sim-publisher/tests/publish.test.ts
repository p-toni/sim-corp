import { beforeEach, describe, expect, it, vi } from "vitest";
import { TelemetryEnvelopeSchema } from "@sim-corp/schemas";
import type { MqttPublisher, SimTwinClient } from "../src/core/types";
import { SimPublisherManager } from "../src/core/publish";

class FakeMqttPublisher implements MqttPublisher {
  public readonly messages: Array<{ topic: string; payload: string }> = [];
  async publish(topic: string, payload: string): Promise<void> {
    this.messages.push({ topic, payload });
  }
}

class FakeSimTwinClient implements SimTwinClient {
  constructor(private readonly sampleIntervalSeconds = 0.1) {}

  async runSimulation(): Promise<any> {
    return {
      telemetry: [
        { ts: new Date(0).toISOString(), elapsedSeconds: 0, btC: 180, machineId: "SIM" },
        { ts: new Date(1000).toISOString(), elapsedSeconds: this.sampleIntervalSeconds, btC: 182, machineId: "SIM" }
      ],
      events: [
        { ts: new Date(0).toISOString(), type: "CHARGE", payload: { elapsedSeconds: 0 }, machineId: "SIM" }
      ]
    };
  }
}

describe("SimPublisherManager", () => {
  let mqtt: FakeMqttPublisher;
  let simTwin: FakeSimTwinClient;
  let manager: SimPublisherManager;

  beforeEach(() => {
    vi.useFakeTimers();
    mqtt = new FakeMqttPublisher();
    simTwin = new FakeSimTwinClient();
    manager = new SimPublisherManager(mqtt, simTwin);
  });

  it("publishes telemetry and events with correct topics and envelope shape", async () => {
    const session = await manager.start({
      orgId: "org",
      siteId: "site",
      machineId: "machine",
      batchSizeKg: 5,
      chargeTempC: 180,
      targetFirstCrackSeconds: 480,
      targetDropSeconds: 600,
      maxTempC: 220,
      sampleIntervalSeconds: 1,
      noiseStdDev: 0.5
    });

    await vi.runAllTimersAsync();

    expect(mqtt.messages.length).toBeGreaterThanOrEqual(3);
    const topics = mqtt.messages.map((m) => m.topic);
    expect(topics).toContain("roaster/org/site/machine/telemetry");
    expect(topics).toContain("roaster/org/site/machine/events");

    mqtt.messages.forEach((msg) => {
      const parsed = TelemetryEnvelopeSchema.safeParse(JSON.parse(msg.payload));
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.origin.machineId).toBe("machine");
    });

    expect(session.stats.telemetrySent).toBeGreaterThan(0);
    expect(session.stats.eventsSent).toBe(1);
  });

  it("can stop a session", async () => {
    const session = await manager.start({
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
    });

    const stopped = manager.stop(session.id);
    expect(stopped).toBe(true);
    await vi.runAllTimersAsync();
    expect(manager.getSession(session.id)).toBeUndefined();
  });
});
