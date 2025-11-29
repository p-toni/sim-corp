import { describe, expect, it } from "vitest";
import { attachSubscriber } from "../src/mqtt/subscriber";
import { InferenceEngine } from "../src/core/engine";
import type { MqttClient } from "../src/mqtt/client";
import { TelemetryEnvelopeSchema } from "@sim-corp/schemas";

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
  it("publishes inferred events to events topic", async () => {
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
  });
});
