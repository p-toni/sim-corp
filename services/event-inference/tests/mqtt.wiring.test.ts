import { afterEach, describe, expect, it } from "vitest";
import { attachSubscriber } from "../src/mqtt/subscriber";
import { InferenceEngine } from "../src/core/engine";
import type { MqttClient } from "../src/mqtt/client";
import { TelemetryEnvelopeSchema, getEnvelopeSigningBytes } from "@sim-corp/schemas";
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";

class FakeMqttClient implements MqttClient {
  public published: Array<{ topic: string; payload: string }> = [];
  private handler: ((topic: string, payload: Buffer) => void) | null = null;
  async subscribe(_topic: string | string[], onMessage: (topic: string, payload: Buffer) => void): Promise<void> {
    this.handler = onMessage;
  }
  async publish(topic: string, payload: string): Promise<void> {
    this.published.push({ topic, payload });
  }
  async disconnect(): Promise<void> {}

  trigger(topic: string, payload: unknown): void {
    this.handler?.(topic, Buffer.from(JSON.stringify(payload)));
  }
}

describe("MQTT wiring", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  it("publishes inferred events to events topic", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    process.env.SIGNING_MODE = "ed25519";
    process.env.SIGNING_KID = "service:event-inference@o/s/m";
    process.env.SIGNING_PRIVATE_KEY_B64 = privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    const publicKeyB64 = publicKey.export({ format: "der", type: "spki" }).toString("base64");

    const mqtt = new FakeMqttClient();
    const engine = new InferenceEngine();
    await attachSubscriber(mqtt, engine);

    mqtt.trigger("roaster/o/s/m/telemetry", {
      ts: new Date(0).toISOString(),
      origin: { orgId: "o", siteId: "s", machineId: "m" },
      topic: "telemetry",
      payload: {
        ts: new Date(0).toISOString(),
        machineId: "m",
        elapsedSeconds: 0,
        btC: 180,
        extras: {}
      }
    });

    expect(mqtt.published.length).toBeGreaterThan(0);
    const parsed = TelemetryEnvelopeSchema.safeParse(JSON.parse(mqtt.published[0].payload));
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.topic).toBe("event");
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
});
