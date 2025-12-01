import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server";
import { MissionStore } from "../src/core/mission-store";
import { openKernelDatabase } from "../src/db/connection";
import { MissionRepository } from "../src/db/repo";

describe("mission routes", () => {
  let server: FastifyInstance;
  let dbPath: string;
  const healthySignals = { session: { telemetryPoints: 120, durationSec: 200, hasBT: true } };

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `kernel-test-${Date.now()}.db`);
    const db = openKernelDatabase(dbPath);
    server = await buildServer({ missionStore: new MissionStore(new MissionRepository(db), { baseBackoffMs: 1 }), dbPath });
  });

  afterEach(async () => {
    await server.close();
    if (dbPath && fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { force: true });
    }
  });

  it("creates and lists missions", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/missions",
      payload: {
        goal: "generate-roast-report",
        params: { sessionId: "s1" },
        signals: healthySignals
      }
    });

    expect(response.statusCode).toBe(201);
    const created = response.json() as { missionId: string; status: string };
    expect(created.missionId).toBeTruthy();
    expect(created.status).toBe("PENDING");

    const list = await server.inject({ method: "GET", url: "/missions" });
    expect(list.statusCode).toBe(200);
    const missions = list.json() as { items: Array<{ missionId: string }> };
    expect(missions.items.length).toBeGreaterThan(0);

    const metrics = await server.inject({ method: "GET", url: "/missions/metrics" });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json().total).toBeGreaterThan(0);
  });

  it("dedupes mission creation by idempotencyKey", async () => {
    const payload = {
      goal: "generate-roast-report",
      params: { sessionId: "s1" },
      signals: healthySignals,
      idempotencyKey: "report-s1"
    };
    const first = await server.inject({ method: "POST", url: "/missions", payload });
    const second = await server.inject({ method: "POST", url: "/missions", payload });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect((first.json() as { missionId: string }).missionId).toBe((second.json() as { missionId: string }).missionId);
  });

  it("supports leases, heartbeat, and retryable failures", async () => {
    const create = await server.inject({
      method: "POST",
      url: "/missions",
      payload: { goal: "generate-roast-report", params: { sessionId: "s1" }, signals: healthySignals }
    });
    expect(create.statusCode).toBe(201);

    const claim = await server.inject({
      method: "POST",
      url: "/missions/claim",
      payload: { agentName: "worker-1", goals: ["generate-roast-report"] }
    });
    expect(claim.statusCode).toBe(200);
    const claimed = claim.json() as { missionId: string; leaseId?: string };
    expect(claimed.leaseId).toBeTruthy();

    const heartbeat = await server.inject({
      method: "POST",
      url: `/missions/${claimed.missionId}/heartbeat`,
      payload: { leaseId: claimed.leaseId, agentName: "worker-1" }
    });
    expect(heartbeat.statusCode).toBe(200);

    const fail = await server.inject({
      method: "POST",
      url: `/missions/${claimed.missionId}/fail`,
      payload: { error: "boom", retryable: true, leaseId: claimed.leaseId }
    });
    expect(fail.statusCode).toBe(200);
    expect(fail.json().status).toBe("RETRY");

    await new Promise((resolve) => setTimeout(resolve, 5));

    const reclaim = await server.inject({
      method: "POST",
      url: "/missions/claim",
      payload: { agentName: "worker-1", goals: ["generate-roast-report"] }
    });
    expect(reclaim.statusCode).toBe(200);
    const retryMission = reclaim.json() as { missionId: string; attempts: number };
    expect(retryMission.attempts).toBeGreaterThan(0);
  });

  it("fetches mission by id", async () => {
    const create = await server.inject({
      method: "POST",
      url: "/missions",
      payload: { goal: "generate-roast-report", params: { sessionId: "s1" }, signals: healthySignals }
    });
    const missionId = (create.json() as { missionId: string }).missionId;
    const get = await server.inject({ method: "GET", url: `/missions/${missionId}` });
    expect(get.statusCode).toBe(200);
    expect((get.json() as { missionId: string }).missionId).toBe(missionId);
  });

  it("quarantines missions with weak signals", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/missions",
      payload: {
        goal: "generate-roast-report",
        params: { sessionId: "weak" },
        signals: { session: { telemetryPoints: 5, durationSec: 10, hasBT: false } }
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { status: string; governance?: { reasons?: Array<{ code?: string }> } };
    expect(body.status).toBe("QUARANTINED");
    expect(body.governance?.reasons?.[0]?.code).toBe("LOW_TELEMETRY_POINTS");
  });

  it("quarantines missions missing signals", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/missions",
      payload: {
        goal: "generate-roast-report",
        params: { sessionId: "missing-signals" }
      }
    });

    expect(response.statusCode).toBe(201);
    const body = response.json() as { status: string; governance?: { reasons?: Array<{ code?: string }> } };
    expect(body.status).toBe("QUARANTINED");
    expect(body.governance?.reasons?.[0]?.code).toBe("MISSING_SIGNALS");
  });

  it("approves quarantined missions", async () => {
    const create = await server.inject({
      method: "POST",
      url: "/missions",
      payload: {
        goal: "generate-roast-report",
        params: { sessionId: "to-approve" },
        signals: { session: { telemetryPoints: 1, durationSec: 5 } }
      }
    });
    const missionId = (create.json() as { missionId: string }).missionId;
    const approve = await server.inject({ method: "POST", url: `/missions/${missionId}/approve`, payload: { note: "looks fine" } });
    expect(approve.statusCode).toBe(200);
    const body = approve.json() as { status: string; governance?: { decidedBy?: string } };
    expect(body.status).toBe("PENDING");
    expect(body.governance?.decidedBy).toBe("HUMAN");
  });

  it("supports filtering by subjectId and machineId", async () => {
    const repo = new MissionRepository(openKernelDatabase(dbPath));
    const store = new MissionStore(repo, { baseBackoffMs: 1 });
    await store.createMission({
      goal: "generate-roast-report",
      subjectId: "target-subject",
      context: { machineId: "mx-1" }
    });
    await store.createMission({
      goal: "generate-roast-report",
      subjectId: "other",
      context: { machineId: "mx-2" }
    });

    const bySubject = await server.inject({ method: "GET", url: "/missions?subjectId=target-subject" });
    expect(bySubject.statusCode).toBe(200);
    const subjectItems = (bySubject.json() as { items: Array<{ subjectId?: string }> }).items;
    expect(subjectItems.every((m) => m.subjectId === "target-subject")).toBe(true);

    const byMachine = await server.inject({ method: "GET", url: "/missions?machineId=mx-1" });
    expect(byMachine.statusCode).toBe(200);
    const machineItems = (byMachine.json() as { items: Array<{ context?: { machineId?: string } }> }).items;
    expect(machineItems.length).toBe(1);
    expect(machineItems[0]?.context?.machineId).toBe("mx-1");
  });

  it("supports retryNow for retryable missions", async () => {
    const repo = new MissionRepository(openKernelDatabase(dbPath));
    const store = new MissionStore(repo, { baseBackoffMs: 1 });
    const { mission } = store.createMission({
      goal: "generate-roast-report",
      status: "RETRY",
      nextRetryAt: new Date(Date.now() + 60_000).toISOString()
    });

    const response = await server.inject({ method: "POST", url: `/missions/${mission.missionId}/retryNow` });
    expect(response.statusCode).toBe(200);
    const updated = response.json() as { status: string; nextRetryAt?: string; governance?: { reasons?: Array<{ code?: string }> } };
    expect(updated.status).toBe("RETRY");
    expect(updated.nextRetryAt).toBeTruthy();
    expect(new Date(updated.nextRetryAt ?? 0).getTime()).toBeLessThanOrEqual(Date.now());
    expect(updated.governance?.reasons?.some((r) => r.code === "MANUAL_RETRY_NOW")).toBe(true);
  });

  it("rate limits missions when bucket is empty", async () => {
    const config = {
      rateLimits: { "generate-roast-report": { capacity: 1, refillPerSec: 0.001 } },
      gates: {
        "generate-roast-report": {
          minTelemetryPoints: 10,
          minDurationSec: 10,
          requireBTorET: true,
          quarantineOnMissingSignals: true,
          quarantineOnSilenceClose: true
        }
      },
      policy: { allowedGoals: ["generate-roast-report"] }
    };
    await server.inject({ method: "PUT", url: "/governor/config", payload: config });

    const first = await server.inject({
      method: "POST",
      url: "/missions",
      payload: { goal: "generate-roast-report", params: { sessionId: "rate-1" }, signals: healthySignals }
    });
    expect(first.statusCode).toBe(201);
    expect((first.json() as { status: string }).status).toBe("PENDING");

    const second = await server.inject({
      method: "POST",
      url: "/missions",
      payload: { goal: "generate-roast-report", params: { sessionId: "rate-2" }, signals: healthySignals }
    });
    const body = second.json() as { status: string; nextRetryAt?: string; governance?: { reasons?: Array<{ code?: string }> } };
    expect(body.status).toBe("RETRY");
    expect(body.nextRetryAt).toBeTruthy();
    expect(body.governance?.reasons?.[0]?.code).toBe("RATE_LIMITED");
  });
});
