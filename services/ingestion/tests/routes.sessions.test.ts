import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("session routes", () => {
  it("returns sessions data", async () => {
    const server = await buildServer({ logger: false, mqttClient: null, enableGracefulShutdown: false });
    // seed via repo through session routes not trivial; rely on repo being empty but endpoints functional
    const res = await server.inject({ method: "GET", url: "/sessions" });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json())).toBe(true);
    await server.close();
  });
});
