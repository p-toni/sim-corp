import { describe, expect, it, afterEach } from "vitest";
import { DriverBridge } from "../src/core/bridge";
import type { Driver, DriverConfig } from "@sim-corp/driver-core";
import type { MqttPublisher } from "../src/mqtt/publisher";
import { TelemetryEnvelopeSchema, getEnvelopeSigningBytes } from "@sim-corp/schemas";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";

class FakeDriver implements Driver {
  constructor(private readonly cfg: DriverConfig) {}
  async connect(): Promise<void> {}
  async readTelemetry() {
    return {
      ts: new Date(0).toISOString(),
      machineId: this.cfg.machineId,
      elapsedSeconds: 0,
      btC: 180,
      extras: {}
    };
  }
  async disconnect(): Promise<void> {}
}

class FakePublisher implements MqttPublisher {
  public messages: Array<{ topic: string; payload: string }> = [];
  async publish(topic: string, payload: string): Promise<void> {
    this.messages.push({ topic, payload });
  }
  async disconnect(): Promise<void> {}
}

describe("DriverBridge", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("publishes telemetry envelopes on interval", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    process.env.SIGNING_MODE = "ed25519";
    process.env.SIGNING_KID = "device:test@org/site/machine";
    process.env.SIGNING_PRIVATE_KEY_B64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    const publicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

    const publisher = new FakePublisher();
    const bridge = new DriverBridge({
      driverFactory: (cfg) => new FakeDriver(cfg),
      mqttPublisher: publisher,
      pollIntervalSeconds: 0.01
    });

    const session = await bridge.start({
      orgId: "org",
      siteId: "site",
      machineId: "machine",
      connection: {}
    });

    await new Promise((resolve) => setTimeout(resolve, 180));
    await session.stop();

    expect(publisher.messages.length).toBeGreaterThan(0);
    const first = publisher.messages[0];
    expect(first.topic).toBe("roaster/org/site/machine/telemetry");
    const parsed = TelemetryEnvelopeSchema.safeParse(JSON.parse(first.payload));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.origin.machineId).toBe("machine");
    if (parsed.success) {
      expect(parsed.data.kid).toBe(process.env.SIGNING_KID);
      expect(parsed.data.sig).toBeTruthy();
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
});
