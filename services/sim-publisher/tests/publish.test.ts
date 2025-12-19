import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { TelemetryEnvelopeSchema, getEnvelopeSigningBytes } from "@sim-corp/schemas";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
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
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.useFakeTimers();
    mqtt = new FakeMqttPublisher();
    simTwin = new FakeSimTwinClient();
    manager = new SimPublisherManager(mqtt, simTwin);
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("publishes telemetry and events with correct topics and envelope shape", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    process.env.SIGNING_MODE = "ed25519";
    process.env.SIGNING_KID = "service:sim-publisher@org/site/machine";
    process.env.SIGNING_PRIVATE_KEY_B64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    const publicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

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
      if (parsed.success) {
        expect(parsed.data.kid).toBe(process.env.SIGNING_KID);
        const bytes = getEnvelopeSigningBytes(parsed.data);
        const ok = verify(
          null,
          bytes,
          createPublicKey({ key: Buffer.from(publicKeyB64, "base64"), format: "der", type: "spki" }),
          Buffer.from(parsed.data.sig ?? "", "base64")
        );
        expect(ok).toBe(true);
      }
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
