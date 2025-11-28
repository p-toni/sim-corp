import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("mission routes", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
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
  });

  it("claims, completes, and fails missions", async () => {
    const first = await server.inject({
      method: "POST",
      url: "/missions",
      payload: { goal: "generate-roast-report", params: { sessionId: "s1" } }
    });
    const second = await server.inject({
      method: "POST",
      url: "/missions",
      payload: { goal: "other-task", params: {} }
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);

    const claim = await server.inject({
      method: "POST",
      url: "/missions/claim",
      payload: { agentName: "worker-1", goals: ["generate-roast-report"] }
    });
    expect(claim.statusCode).toBe(200);
    const claimed = claim.json() as { missionId: string };

    const complete = await server.inject({
      method: "POST",
      url: `/missions/${claimed.missionId}/complete`,
      payload: { summary: { ok: true } }
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().status).toBe("DONE");

    const fail = await server.inject({
      method: "POST",
      url: "/missions/unknown/fail",
      payload: { error: "boom" }
    });
    expect(fail.statusCode).toBe(404);
  });
});
