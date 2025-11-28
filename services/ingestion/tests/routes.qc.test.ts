import Fastify from "fastify";
import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { IngestionRepository } from "../src/db/repo";
import { registerSessionQcRoutes } from "../src/routes/sessions-qc";

function setupServer() {
  const app = Fastify({ logger: false });
  const db = new Database(":memory:");
  const schema = fs.readFileSync(path.resolve(__dirname, "../src/db/schema.sql"), "utf-8");
  db.exec(schema);
  const repo = new IngestionRepository(db);
  repo.upsertSession({
    sessionId: "s1",
    orgId: "o",
    siteId: "s",
    machineId: "m",
    startedAt: new Date(0).toISOString(),
    endedAt: null,
    status: "ACTIVE",
    dropSeconds: 300
  });
  registerSessionQcRoutes(app, { repo });
  return { app, repo };
}

describe("session qc routes", () => {
  it("handles meta get/put", async () => {
    const { app } = setupServer();
    const res = await app.inject({ method: "GET", url: "/sessions/s1/meta" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ tags: [], extra: {} });

    const putRes = await app.inject({
      method: "PUT",
      url: "/sessions/s1/meta",
      payload: { beanName: "Colombia" }
    });
    expect(putRes.statusCode).toBe(200);
    expect(putRes.json().beanName).toBe("Colombia");
    await app.close();
  });

  it("adds and lists notes", async () => {
    const { app } = setupServer();
    const postRes = await app.inject({
      method: "POST",
      url: "/sessions/s1/notes",
      payload: { text: "Nice roast" }
    });
    expect(postRes.statusCode).toBe(201);
    const note = postRes.json();
    expect(note.text).toBe("Nice roast");

    const listRes = await app.inject({ method: "GET", url: "/sessions/s1/notes" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toHaveLength(1);
    await app.close();
  });

  it("validates override elapsedSeconds within bounds", async () => {
    const { app } = setupServer();
    const bad = await app.inject({
      method: "PUT",
      url: "/sessions/s1/events/overrides",
      payload: { overrides: [{ eventType: "DROP", elapsedSeconds: 999, updatedAt: new Date().toISOString() }] }
    });
    expect(bad.statusCode).toBe(400);

    const ok = await app.inject({
      method: "PUT",
      url: "/sessions/s1/events/overrides",
      payload: { overrides: [{ eventType: "DROP", elapsedSeconds: 200, updatedAt: new Date().toISOString() }] }
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()[0].eventType).toBe("DROP");
    await app.close();
  });
});
