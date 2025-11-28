import { describe, expect, it } from "vitest";
import { Dispatcher } from "../src/core/dispatcher";
import type { KernelClientLike, MissionRequest, MissionResult } from "../src/core/kernel-client";
import { buildServer } from "../src/server";

class NoopKernel {
  async createMission(_: MissionRequest): Promise<MissionResult> {
    return "created";
  }
}

describe("dispatcher routes", () => {
  it("returns status counters", async () => {
    const dispatcher = new Dispatcher({
      kernel: new NoopKernel() as KernelClientLike,
      subscribedTopics: ["ops/+/+/+/session/closed"]
    });
    const app = await buildServer({ dispatcher, mqttClient: null });
    const response = await app.inject({ method: "GET", url: "/status" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.counters).toBeDefined();
    expect(body.subscribedTopics).toContain("ops/+/+/+/session/closed");
  });

  it("responds to health", async () => {
    const dispatcher = new Dispatcher({
      kernel: new NoopKernel() as KernelClientLike,
      subscribedTopics: ["ops/+/+/+/session/closed"]
    });
    const app = await buildServer({ dispatcher, mqttClient: null });
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
