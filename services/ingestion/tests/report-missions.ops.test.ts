import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import type { SessionClosedEvent } from "@sim-corp/schemas";
import { ReportMissionEnqueuer } from "../src/core/report-missions";
import { DEFAULT_REPORT_KIND, IngestionRepository } from "../src/db/repo";
import type { OpsEventPublisher } from "../src/ops/publisher";
import { buildSessionClosedTopic } from "../src/ops/publisher";

const envKeys = [
  "AUTO_REPORT_MISSIONS_ENABLED",
  "INGESTION_OPS_EVENTS_ENABLED",
  "INGESTION_KERNEL_ENQUEUE_FALLBACK_ENABLED",
  "INGESTION_KERNEL_URL"
] as const;
const envBackup: Record<(typeof envKeys)[number], string | undefined> = Object.fromEntries(
  envKeys.map((key) => [key, process.env[key]])
) as Record<(typeof envKeys)[number], string | undefined>;

class RecordingPublisher implements OpsEventPublisher {
  calls = 0;
  lastEvent?: SessionClosedEvent;
  lastTopic?: string;
  async publishSessionClosed(event: SessionClosedEvent): Promise<void> {
    this.calls += 1;
    this.lastEvent = event;
    this.lastTopic = buildSessionClosedTopic(event);
  }
  async disconnect(): Promise<void> {}
}

class ThrowingPublisher implements OpsEventPublisher {
  async publishSessionClosed(): Promise<void> {
    throw new Error("boom");
  }
  async disconnect(): Promise<void> {}
}

function createRepo(): IngestionRepository {
  const db = new Database(":memory:");
  const schema = fs.readFileSync(path.resolve(__dirname, "../src/db/schema.sql"), "utf-8");
  db.exec(schema);
  return new IngestionRepository(db);
}

const closedSession = {
  sessionId: "session-1",
  orgId: "org-1",
  siteId: "site-1",
  machineId: "machine-1",
  startedAt: "2024-01-01T00:00:00.000Z",
  endedAt: "2024-01-01T00:10:00.000Z",
  status: "CLOSED" as const,
  dropSeconds: 600
};

describe("ReportMissionEnqueuer ops events", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.AUTO_REPORT_MISSIONS_ENABLED = "true";
    process.env.INGESTION_OPS_EVENTS_ENABLED = "true";
    process.env.INGESTION_KERNEL_ENQUEUE_FALLBACK_ENABLED = "true";
    process.env.INGESTION_KERNEL_URL = "http://kernel.local";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    envKeys.forEach((key) => {
      if (envBackup[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = envBackup[key];
      }
    });
  });

  it("publishes session.closed event when ops events enabled and still enqueues via fallback", async () => {
    const repo = createRepo();
    const publisher = new RecordingPublisher();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const enqueuer = new ReportMissionEnqueuer({ repo, opsPublisher: publisher });

    await enqueuer.handleSessionClosed(closedSession);

    expect(publisher.calls).toBe(1);
    expect(publisher.lastEvent?.sessionId).toBe(closedSession.sessionId);
    expect(publisher.lastTopic).toBe(
      `ops/${closedSession.orgId}/${closedSession.siteId}/${closedSession.machineId}/session/closed`
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to kernel enqueue when publish fails and fallback enabled", async () => {
    const repo = createRepo();
    const publisher = new ThrowingPublisher();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    const enqueuer = new ReportMissionEnqueuer({ repo, opsPublisher: publisher });

    await enqueuer.handleSessionClosed(closedSession);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toContain("/missions");
    const body = JSON.parse((request?.[1] as RequestInit).body as string);
    expect(body.goal).toBe("generate-roast-report");
    expect(body.idempotencyKey).toBe(`generate-roast-report:${DEFAULT_REPORT_KIND}:${closedSession.sessionId}`);
    expect(body.params).toEqual({ sessionId: closedSession.sessionId, reportKind: DEFAULT_REPORT_KIND });
  });

  it("skips direct enqueue when fallback disabled and publish succeeds", async () => {
    const repo = createRepo();
    const publisher = new RecordingPublisher();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => "" });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);
    process.env.INGESTION_KERNEL_ENQUEUE_FALLBACK_ENABLED = "false";
    const enqueuer = new ReportMissionEnqueuer({ repo, opsPublisher: publisher });

    await enqueuer.handleSessionClosed(closedSession);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(publisher.calls).toBe(1);
  });
});
