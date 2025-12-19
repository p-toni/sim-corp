import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { IngestionRepository } from "../src/db/repo";
import { registerSessionQcRoutes } from "../src/routes/sessions-qc";
import { registerAuth } from "../src/auth";

vi.mock("../src/auth/clerk-verifier", () => ({
  verifyClerkToken: vi.fn(async () => ({
    userId: "clerk-user",
    orgId: "org-from-token",
    payload: {},
    name: "Clerk User"
  }))
}));

function setupServer(authMode: "dev" | "clerk" = "dev") {
  const prevAuth = process.env.AUTH_MODE;
  const prevDevOrg = process.env.DEV_ORG_ID;
  const prevDevUser = process.env.DEV_USER_ID;
  const prevIssuer = process.env.CLERK_JWT_ISSUER;
  process.env.AUTH_MODE = authMode;
  process.env.DEV_ORG_ID = "o";
  process.env.DEV_USER_ID = "dev-user";
  process.env.CLERK_JWT_ISSUER = process.env.CLERK_JWT_ISSUER ?? "https://clerk.test";
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
  registerAuth(app);
  registerSessionQcRoutes(app, { repo });
  const restoreEnv = () => {
    process.env.AUTH_MODE = prevAuth;
    process.env.DEV_ORG_ID = prevDevOrg;
    process.env.DEV_USER_ID = prevDevUser;
    process.env.CLERK_JWT_ISSUER = prevIssuer;
  };
  return { app, repo, restoreEnv };
}

describe("session qc routes", () => {
  it("handles meta get/put", async () => {
    const { app, restoreEnv } = setupServer();
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
    restoreEnv();
  });

  it("adds and lists notes", async () => {
    const { app, repo, restoreEnv } = setupServer();
    const postRes = await app.inject({
      method: "POST",
      url: "/sessions/s1/notes",
      payload: { text: "Nice roast" }
    });
    expect(postRes.statusCode).toBe(201);
    const note = postRes.json();
    expect(note.text).toBe("Nice roast");
    expect(note.actor?.id).toBe("dev-user");

    const listRes = await app.inject({ method: "GET", url: "/sessions/s1/notes" });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toHaveLength(1);
    const row = (repo as unknown as { db: Database }).db
      .prepare("SELECT actor_json FROM session_notes LIMIT 1")
      .get();
    expect(row.actor_json).toContain("dev-user");
    await app.close();
    restoreEnv();
  });

  it("validates override elapsedSeconds within bounds", async () => {
    const { app, restoreEnv } = setupServer();
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
    restoreEnv();
  });

  it("rejects org mismatches in clerk mode", async () => {
    const { app, restoreEnv } = setupServer("clerk");
    const res = await app.inject({
      method: "POST",
      url: "/sessions/s1/notes",
      headers: { authorization: "Bearer token" },
      payload: { text: "blocked" }
    });
    expect(res.statusCode).toBe(403);
    await app.close();
    restoreEnv();
  });
});
