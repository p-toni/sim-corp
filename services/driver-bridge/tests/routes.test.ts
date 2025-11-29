import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import type { DriverBridge } from "../src/core/bridge";
import type { Driver, DriverConfig } from "@sim-corp/driver-core";
import type { MqttPublisher } from "../src/mqtt/publisher";
import { DriverBridge as Bridge } from "../src/core/bridge";

class StubDriver implements Driver {
  private status = { state: "CONNECTED", custom: true };
  async connect(): Promise<void> {}
  async readTelemetry() {
    return { ts: new Date().toISOString(), machineId: "m", elapsedSeconds: 0, btC: 180, extras: {} };
  }
  async disconnect(): Promise<void> {}
  getStatus() {
    return this.status;
  }
}

class StubPublisher implements MqttPublisher {
  async publish(): Promise<void> {}
  async disconnect(): Promise<void> {}
}

describe("driver-bridge routes", () => {
  let server: Awaited<ReturnType<typeof buildServer>>;
  let bridge: DriverBridge;

  beforeEach(async () => {
    bridge = new Bridge({
      driverFactory: (_cfg: DriverConfig) => new StubDriver(),
      mqttPublisher: new StubPublisher(),
      pollIntervalSeconds: 0.01
    });
    server = await buildServer({
      logger: false,
      bridge,
      driverFactory: (_cfg) => new StubDriver(),
      mqttPublisher: new StubPublisher()
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it("starts and stops sessions", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/bridge/start",
      payload: {
        driverName: "fake",
        config: {
          orgId: "o",
          siteId: "s",
          machineId: "m",
          connection: {}
        }
      }
    });
    expect(res.statusCode).toBe(200);
    const parsed = res.json() as { sessionId: string };
    expect(parsed.sessionId).toBeDefined();

    const stop = await server.inject({
      method: "POST",
      url: "/bridge/stop",
      payload: { sessionId: parsed.sessionId }
    });
    expect(stop.statusCode).toBe(200);
  });

  it("merges tcp-line env config and exposes driver status", async () => {
    const prevEnv = process.env.DRIVER_TCP_LINE_CONFIG_JSON;
    process.env.DRIVER_TCP_LINE_CONFIG_JSON = JSON.stringify({
      host: "10.0.0.5",
      port: 9999,
      emitIntervalMs: 250
    });

    const res = await server.inject({
      method: "POST",
      url: "/bridge/start",
      payload: {
        driverName: "tcp-line",
        config: {
          orgId: "o",
          siteId: "s",
          machineId: "m",
          connection: {}
        }
      }
    });
    expect(res.statusCode).toBe(200);

    const status = await server.inject({ method: "GET", url: "/bridge/status" });
    const body = status.json() as Array<{ config: DriverConfig; driverStatus: Record<string, unknown> }>;
    expect(body[0].config.connection.host).toBe("10.0.0.5");
    expect(body[0].config.connection.port).toBe(9999);
    expect(body[0].config.connection.emitIntervalMs).toBe(250);
    expect(body[0].config.connection.sampleIntervalSeconds).toBeCloseTo(0.25);
    expect(body[0].driverStatus?.custom).toBe(true);

    if (prevEnv !== undefined) {
      process.env.DRIVER_TCP_LINE_CONFIG_JSON = prevEnv;
    } else {
      delete process.env.DRIVER_TCP_LINE_CONFIG_JSON;
    }
  });
});
