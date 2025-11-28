import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { PersistencePipeline } from "../src/core/persist";
import { Sessionizer } from "../src/core/sessionizer";
import { IngestionRepository } from "../src/db/repo";
import type { TelemetryEnvelope } from "@sim-corp/schemas";

const baseEnvelope: TelemetryEnvelope = {
  ts: new Date(0).toISOString(),
  origin: { orgId: "o", siteId: "s", machineId: "m" },
  topic: "telemetry",
  payload: {
    ts: new Date(0).toISOString(),
    machineId: "m",
    elapsedSeconds: 0,
    btC: 180
  }
};

function createRepo(): IngestionRepository {
  const db = new Database(":memory:");
  const schema = fs.readFileSync(path.resolve(__dirname, "../src/db/schema.sql"), "utf-8");
  db.exec(schema);
  return new IngestionRepository(db);
}

describe("PersistencePipeline close hooks", () => {
  it("invokes onSessionClosed when session drops", () => {
    const repo = createRepo();
    const sessionizer = new Sessionizer({ sessionGapSeconds: 10, closeSilenceSeconds: 1 });
    const closed: string[] = [];
    const persist = new PersistencePipeline({
      repo,
      sessionizer,
      onSessionClosed: (session) => closed.push(session.sessionId)
    });

    const envWithSession = persist.persistEnvelope(baseEnvelope);
    expect(envWithSession.sessionId).toBeDefined();

    persist.persistEnvelope({
      ...envWithSession,
      topic: "event",
      payload: { ts: envWithSession.ts, machineId: "m", type: "DROP" }
    });

    expect(closed).toContain(envWithSession.sessionId as string);
  });
});
