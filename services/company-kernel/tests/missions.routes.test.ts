import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { MissionStore } from "../src/core/mission-store";

describe("mission routes", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer({ missionStore: new MissionStore({ baseBackoffMs: 1 }) });
  });

  afterEach(async () => {
    await server.close();
  });

  it("creates and lists missions", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/missions",
      payload: {
        goal: "generate-roast-report",
        params: { sessionId: "s1" }
      }
    });

    expect(response.statusCode).toBe(201);
    const created = response.json() as { missionId: string; status: string };
    expect(created.missionId).toBeTruthy();
    expect(created.status).toBe("PENDING");

    const list = await server.inject({ method: "GET", url: "/missions" });
    expect(list.statusCode).toBe(200);
    const missions = list.json() as Array<{ missionId: string }>;
    expect(missions.length).toBeGreaterThan(0);

    const metrics = await server.inject({ method: "GET", url: "/missions/metrics" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json().total).toBeGreaterThan(0);
  });

  it("dedupes mission creation by idempotencyKey", async () => {
    const payload = { goal: "generate-roast-report", params: { sessionId: "s1" }, idempotencyKey: "report-s1" };
    const first = await server.inject({ method: "POST", url: "/missions", payload });
    const second = await server.inject({ method: "POST", url: "/missions", payload });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect((first.json() as { missionId: string }).missionId).toBe((second.json() as { missionId: string }).missionId);
  });

  it("supports leases, heartbeat, and retryable failures", async () => {
    const create = await server.inject({
      method: "POST",
      url: "/missions",
      payload: { goal: "generate-roast-report", params: { sessionId: "s1" } }
    });
    expect(create.statusCode).toBe(201);

    const claim = await server.inject({
      method: "POST",
      url: "/missions/claim",
      payload: { agentName: "worker-1", goals: ["generate-roast-report"] }
    });
    expect(claim.statusCode).toBe(200);
    const claimed = claim.json() as { missionId: string; leaseId?: string };
    expect(claimed.leaseId).toBeTruthy();

    const heartbeat = await server.inject({
      method: "POST",
      url: `/missions/${claimed.missionId}/heartbeat`,
      payload: { leaseId: claimed.leaseId, agentName: "worker-1" }
    });
    expect(heartbeat.statusCode).toBe(200);

    const fail = await server.inject({
      method: "POST",
      url: `/missions/${claimed.missionId}/fail`,
      payload: { error: "boom", retryable: true, leaseId: claimed.leaseId }
    });
    expect(fail.statusCode).toBe(200);
    expect(fail.json().status).toBe("PENDING");

    await new Promise((resolve) => setTimeout(resolve, 5));

    const reclaim = await server.inject({
      method: "POST",
      url: "/missions/claim",
      payload: { agentName: "worker-1", goals: ["generate-roast-report"] }
    });
    expect(reclaim.statusCode).toBe(200);
    const retryMission = reclaim.json() as { missionId: string; attempts: number };
    expect(retryMission.attempts).toBeGreaterThan(0);
  });
});
