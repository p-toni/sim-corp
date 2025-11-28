import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { IngestionRepository } from "../src/db/repo";
import { registerSessionReportRoutes } from "../src/routes/session-reports";
import { registerSessionRoutes } from "../src/routes/sessions";
import { RoastAnalysisSchema } from "@sim-corp/schemas";

function buildTestServer() {
  const app = Fastify({ logger: false });
  const schema = fs.readFileSync(path.resolve(__dirname, "../src/db/schema.sql"), "utf-8");
  const db = new Database(":memory:");
  db.exec(schema);
  const repo = new IngestionRepository(db);
  registerSessionRoutes(app, { repo });
  registerSessionReportRoutes(app, { repo });
  return { app, repo };
}

describe("session report routes", () => {
  it("creates and fetches session reports", async () => {
    const { app, repo } = buildTestServer();

    repo.upsertSession({
      sessionId: "s1",
      orgId: "o1",
      siteId: "site",
      machineId: "mach",
      startedAt: new Date(0).toISOString(),
      endedAt: new Date(0).toISOString(),
      status: "CLOSED"
    });

    const analysis = RoastAnalysisSchema.parse({
      sessionId: "s1",
      orgId: "o1",
      siteId: "site",
      machineId: "mach",
      computedAt: new Date(0).toISOString(),
      phases: [],
      phaseStats: [],
      crashFlick: { crashDetected: false, flickDetected: false }
    });

    const createRes = await app.inject({
      method: "POST",
      url: "/sessions/s1/reports",
      payload: {
        markdown: "# Report",
        analysis
      }
    });
    expect(createRes.statusCode).toBe(201);
    const created = createRes.json() as { reportId: string };
    expect(created.reportId).toBeTruthy();

    const latest = await app.inject({ method: "GET", url: "/sessions/s1/reports/latest" });
    expect(latest.statusCode).toBe(200);
    expect(latest.json().reportId).toBe(created.reportId);

    const list = await app.inject({ method: "GET", url: "/sessions/s1/reports" });
    expect(list.statusCode).toBe(200);
    const reports = list.json() as Array<{ reportId: string }>;
    expect(reports[0].reportId).toBe(created.reportId);

    const getById = await app.inject({ method: "GET", url: `/reports/${created.reportId}` });
    expect(getById.statusCode).toBe(200);
    expect(getById.json().markdown).toContain("Report");

    await app.close();
  });

  it("is idempotent for post-roast reports", async () => {
    const { app, repo } = buildTestServer();

    repo.upsertSession({
      sessionId: "s1",
      orgId: "o1",
      siteId: "site",
      machineId: "mach",
      startedAt: new Date(0).toISOString(),
      endedAt: new Date(0).toISOString(),
      status: "CLOSED"
    });

    const analysis = RoastAnalysisSchema.parse({
      sessionId: "s1",
      orgId: "o1",
      siteId: "site",
      machineId: "mach",
      computedAt: new Date(0).toISOString(),
      phases: [],
      phaseStats: [],
      crashFlick: { crashDetected: false, flickDetected: false }
    });

    const first = await app.inject({
      method: "POST",
      url: "/sessions/s1/reports",
      payload: {
        markdown: "# Report",
        analysis
      }
    });
    const second = await app.inject({
      method: "POST",
      url: "/sessions/s1/reports",
      payload: {
        markdown: "# Report updated",
        analysis
      }
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect((first.json() as { reportId: string }).reportId).toBe((second.json() as { reportId: string }).reportId);

    await app.close();
  });
});
