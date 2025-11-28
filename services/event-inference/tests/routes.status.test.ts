import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("routes", () => {
  it("returns status and allows config update", async () => {
    const server = await buildServer({ logger: false, mqttClient: null });
    const status = await server.inject({ method: "GET", url: "/status" });
    expect(status.statusCode).toBe(200);

    const configRes = await server.inject({
      method: "POST",
      url: "/config",
      payload: {
        orgId: "o",
        siteId: "s",
        machineId: "m",
        config: { fcBtThresholdC: 195 }
      }
    });
    expect(configRes.statusCode).toBe(200);
    const cfg = configRes.json() as { fcBtThresholdC: number };
    expect(cfg.fcBtThresholdC).toBe(195);

    const health = await server.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);

    await server.close();
  });
});
