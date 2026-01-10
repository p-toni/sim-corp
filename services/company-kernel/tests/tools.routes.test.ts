import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("tools routes", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer({ enableGracefulShutdown: false });
  });

  afterEach(async () => {
    await server.close();
  });

  const toolPayload = {
    id: "search:v1",
    name: "SearchTool",
    version: "1.0.0"
  };

  it("registers a new tool", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/tools",
      payload: toolPayload
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject(toolPayload);
  });

  it("lists registered tools", async () => {
    await server.inject({ method: "POST", url: "/tools", payload: toolPayload });

    const response = await server.inject({ method: "GET", url: "/tools" });
    expect(response.statusCode).toBe(200);
    const tools = response.json();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject(toolPayload);
  });

  it("retrieves a tool by id and returns 404 when missing", async () => {
    await server.inject({ method: "POST", url: "/tools", payload: toolPayload });

    const okResponse = await server.inject({ method: "GET", url: "/tools/search:v1" });
    expect(okResponse.statusCode).toBe(200);
    expect(okResponse.json()).toMatchObject(toolPayload);

    const missingResponse = await server.inject({ method: "GET", url: "/tools/unknown:v1" });
    expect(missingResponse.statusCode).toBe(404);
  });
});
