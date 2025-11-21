import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("traces routes", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  const tracePayload = {
    traceId: "trace-1",
    agentId: "agent-1",
    missionId: "mission-1",
    mission: {
      missionId: "mission-1",
      goal: { title: "Test" },
      constraints: [],
      context: {}
    },
    status: "SUCCESS",
    startedAt: "2025-01-01T00:00:00.000Z",
    entries: [
      {
        missionId: "mission-1",
        loopId: "loop-1",
        iteration: 0,
        step: "THINK",
        status: "SUCCESS",
        startedAt: "2025-01-01T00:00:00.000Z",
        completedAt: "2025-01-01T00:00:01.000Z",
        toolCalls: [],
        metrics: []
      }
    ]
  };

  it("stores traces and returns acknowledgement", async () => {
    const response = await server.inject({ method: "POST", url: "/traces", payload: tracePayload });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("lists stored traces", async () => {
    await server.inject({ method: "POST", url: "/traces", payload: tracePayload });

    const response = await server.inject({ method: "GET", url: "/traces" });
    expect(response.statusCode).toBe(200);
    const traces = response.json();
    expect(traces).toHaveLength(1);
    expect(traces[0]).toMatchObject({ traceId: "trace-1" });
  });

  it("retrieves a trace by mission id and returns 404 if missing", async () => {
    await server.inject({ method: "POST", url: "/traces", payload: tracePayload });

    const okResponse = await server.inject({ method: "GET", url: "/traces/mission-1" });
    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.json()).toMatchObject({ missionId: "mission-1" });

    const missingResponse = await server.inject({ method: "GET", url: "/traces/unknown" });
    expect(missingResponse.statusCode).toBe(404);
  });
});
