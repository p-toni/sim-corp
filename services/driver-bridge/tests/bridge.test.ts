import { describe, expect, it } from "vitest";
import { DriverBridge } from "../src/core/bridge";
import type { Driver, DriverConfig } from "@sim-corp/driver-core";
import type { MqttPublisher } from "../src/mqtt/publisher";
import { TelemetryEnvelopeSchema } from "@sim-corp/schemas";

class FakeDriver implements Driver {
  constructor(private readonly cfg: DriverConfig) {}
  async connect(): Promise<void> {}
  async readTelemetry() {
    return {
      ts: new Date(0).toISOString(),
      machineId: this.cfg.machineId,
      elapsedSeconds: 0,
      btC: 180
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
  it("publishes telemetry envelopes on interval", async () => {
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
  });
});
