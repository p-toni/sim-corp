import { afterEach, describe, expect, it } from "vitest";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { IngestionRepository } from "../src/db/repo";
import { TelemetryPointSchema } from "@sim-corp/schemas";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ingestion-repo-"));

describe("IngestionRepository", () => {
  let dbPath: string;
  let repo: IngestionRepository;

  afterEach(() => {
    if (dbPath && fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { force: true });
    }
  });

  it("stores sessions, telemetry, and events", () => {
    dbPath = path.join(tmpDir, `${Date.now()}.db`);
    const db = new Database(dbPath);
    const schema = fs.readFileSync(path.resolve(__dirname, "../src/db/schema.sql"), "utf-8");
    db.exec(schema);
    repo = new IngestionRepository(db);

    repo.upsertSession({
      sessionId: "s1",
      orgId: "o",
      siteId: "s",
      machineId: "m",
      startedAt: new Date(0).toISOString(),
      endedAt: null,
      status: "ACTIVE"
    });

    const point = TelemetryPointSchema.parse({
      ts: new Date(0).toISOString(),
      machineId: "m",
      elapsedSeconds: 0,
      btC: 180
    });
    repo.appendTelemetry("s1", point);
    repo.appendEvent("s1", {
      ts: new Date(1000).toISOString(),
      machineId: "m",
      type: "DROP",
      payload: { elapsedSeconds: 1 }
    });

    const sessions = repo.listSessions();
    expect(sessions.length).toBe(1);
    const telemetry = repo.getTelemetry("s1");
    expect(telemetry.length).toBe(1);
    const events = repo.getEvents("s1");
    expect(events[0].type).toBe("DROP");
  });

  it("stores qc metadata, notes, and overrides", () => {
    dbPath = path.join(tmpDir, `${Date.now()}-qc.db`);
    const db = new Database(dbPath);
    const schema = fs.readFileSync(path.resolve(__dirname, "../src/db/schema.sql"), "utf-8");
    db.exec(schema);
    repo = new IngestionRepository(db);

    repo.upsertSession({
      sessionId: "s1",
      orgId: "o",
      siteId: "s",
      machineId: "m",
      startedAt: new Date(0).toISOString(),
      endedAt: null,
      status: "ACTIVE"
    });

    repo.upsertSessionMeta("s1", { beanName: "Test Bean", tags: ["washed"] });
    const meta = repo.getSessionMeta("s1");
    expect(meta?.beanName).toBe("Test Bean");
    expect(meta?.tags).toEqual(["washed"]);

    const note = repo.addSessionNote("s1", { text: "Tastes bright" });
    expect(note.noteId).toBeTruthy();
    const notes = repo.listSessionNotes("s1");
    expect(notes.length).toBe(1);
    expect(notes[0].text).toBe("Tastes bright");

    const overrides = repo.upsertEventOverrides("s1", [
      { eventType: "FC", elapsedSeconds: 420, source: "HUMAN", updatedAt: new Date().toISOString() }
    ]);
    expect(overrides[0].eventType).toBe("FC");
  });
});
