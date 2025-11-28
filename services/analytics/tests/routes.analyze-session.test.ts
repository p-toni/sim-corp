import { describe, expect, it } from "vitest";
import { buildServer } from "../src/server";

describe("analyze session route", () => {
  it("returns error when ingestion unreachable", async () => {
    const server = await buildServer({ logger: false });
    const res = await server.inject({ method: "GET", url: "/analysis/session/unknown" });
    expect(res.statusCode).toBe(400);
    await server.close();
  });
});
