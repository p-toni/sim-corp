import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("agents routes", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  const agentPayload = {
    id: "strategist:v1",
    name: "Strategist",
    role: "strategist",
    version: "1.0.0"
  };

  it("registers a new agent", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/agents",
      payload: agentPayload
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(agentPayload);
  });

  it("lists registered agents", async () => {
    await server.inject({ method: "POST", url: "/agents", payload: agentPayload });

    const response = await server.inject({ method: "GET", url: "/agents" });
    expect(response.statusCode).toBe(200);
    const agents = response.json();
    expect(agents).toHaveLength(1);
    expect(agents[0]).toMatchObject(agentPayload);
  });

  it("retrieves an agent by id and returns 404 for unknown ids", async () => {
    await server.inject({ method: "POST", url: "/agents", payload: agentPayload });

    const okResponse = await server.inject({ method: "GET", url: "/agents/strategist:v1" });
    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.json()).toMatchObject(agentPayload);

    const missingResponse = await server.inject({ method: "GET", url: "/agents/unknown:v1" });
    expect(missingResponse.statusCode).toBe(404);
  });
});
