import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("sim-twin routes", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer({ logger: false });
  });

  afterEach(async () => {
    await server.close();
  });

  it("reports health", async () => {
    const response = await server.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("simulates a roast with defaults", async () => {
    const response = await server.inject({ method: "POST", url: "/simulate/roast", payload: {} });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      telemetry?: unknown;
      events?: Array<{ type?: unknown }> | undefined;
    }>();
    expect(Array.isArray(body.telemetry)).toBe(true);
    expect(Array.isArray(body.events)).toBe(true);
    const eventTypes = (body.events ?? []).map((event) => String(event.type));
    expect(eventTypes).toContain("FC");
    expect(eventTypes).toContain("DROP");
  });
});
