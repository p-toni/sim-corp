import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("policy routes", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  const unrestrictedTool = {
    id: "search:v1",
    name: "Search",
    version: "1.0.0"
  };

  const restrictedTool = {
    id: "admin:v1",
    name: "Admin",
    version: "1.0.0",
    policyTags: ["restricted"]
  };

  async function registerTool(tool: Record<string, unknown>): Promise<void> {
    await server.inject({ method: "POST", url: "/tools", payload: tool });
  }

  it("allows unrestricted tool invocations", async () => {
    await registerTool(unrestrictedTool);

    const response = await server.inject({
      method: "POST",
      url: "/policy/check",
      payload: {
        agentId: "agent-1",
        tool: "search:v1",
        action: "invoke",
        resource: "mission",
        context: {}
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ decision: "ALLOW" });
  });

  it("denies restricted tool without override", async () => {
    await registerTool(restrictedTool);

    const response = await server.inject({
      method: "POST",
      url: "/policy/check",
      payload: {
        agentId: "agent-1",
        tool: "admin:v1",
        action: "invoke",
        resource: "secret"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ decision: "DENY" });
  });

  it("allows restricted tool when override is set", async () => {
    await registerTool(restrictedTool);

    const response = await server.inject({
      method: "POST",
      url: "/policy/check",
      payload: {
        agentId: "agent-1",
        tool: "admin:v1",
        action: "invoke",
        resource: "secret",
        context: { override: true }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ decision: "ALLOW" });
  });
});
