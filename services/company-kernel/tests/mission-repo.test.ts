import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { openKernelDatabase } from "../src/db/connection";
import { MissionRepository } from "../src/db/repo";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kernel-repo-"));

describe("MissionRepository", () => {
  let dbPath: string;
  let repo: MissionRepository;

  beforeEach(() => {
    dbPath = path.join(tmpDir, `kernel-${Date.now()}.db`);
    const db = openKernelDatabase(dbPath);
    repo = new MissionRepository(db);
  });

  afterEach(() => {
    if (dbPath && fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { force: true });
    }
  });

  it("dedupes by idempotencyKey", () => {
    const first = repo.createMission({ goal: { title: "generate" }, params: { sessionId: "s1" }, idempotencyKey: "key-1" });
    const second = repo.createMission({ goal: { title: "generate" }, params: { sessionId: "s1" }, idempotencyKey: "key-1" });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.mission.missionId).toBe(first.mission.missionId);
  });

  it("claims missions atomically and sets leases", () => {
    repo.createMission({ goal: { title: "g1" }, params: {} });
    repo.createMission({ goal: { title: "g2" }, params: {} });

    const a = repo.claimNext({ agentName: "worker-a", nowIso: new Date(0).toISOString(), leaseDurationMs: 30_000 });
    const b = repo.claimNext({ agentName: "worker-b", nowIso: new Date(0).toISOString(), leaseDurationMs: 30_000 });

    expect(a?.missionId).not.toBe(b?.missionId);
    expect(a?.status).toBe("RUNNING");
    expect(a?.leaseId).toBeTruthy();
  });

  it("reclaims expired leases", () => {
    const { mission } = repo.createMission({ goal: { title: "g1" }, params: {} });
    const claimed = repo.claimNext({ agentName: "worker-a", nowIso: new Date(0).toISOString(), leaseDurationMs: 10_000 });
    expect(claimed?.missionId).toBe(mission.missionId);

    // Force expiry
    const db = openKernelDatabase(dbPath);
    db.prepare(`UPDATE missions SET lease_expires_at = '1970-01-01T00:00:00.000Z' WHERE id = @id`).run({ id: mission.missionId });

    const reclaimed = repo.claimNext({
      agentName: "worker-b",
      nowIso: new Date("1970-01-01T00:00:01.000Z").toISOString(),
      leaseDurationMs: 10_000
    });
    expect(reclaimed?.claimedBy).toBe("worker-b");
    expect(reclaimed?.status).toBe("RUNNING");
  });

  it("schedules retry with backoff", () => {
    const { mission } = repo.createMission({ goal: { title: "g1" }, params: {} });
    const claimed = repo.claimNext({ agentName: "worker-a", nowIso: new Date(0).toISOString(), leaseDurationMs: 10_000 });
    expect(claimed).toBeTruthy();
    const failed = repo.failMission({
      missionId: mission.missionId,
      retryable: true,
      error: { error: "boom" },
      nowIso: new Date(0).toISOString(),
      backoffMs: 1_000
    });
    expect(failed.status).toBe("RETRY");
    expect(failed.nextRetryAt).toBeTruthy();

    const beforeRetry = repo.claimNext({
      agentName: "worker-b",
      nowIso: new Date(500).toISOString(),
      leaseDurationMs: 10_000
    });
    expect(beforeRetry).toBeNull();

    const afterRetry = repo.claimNext({
      agentName: "worker-b",
      nowIso: new Date(2_000).toISOString(),
      leaseDurationMs: 10_000
    });
    expect(afterRetry?.missionId).toBe(mission.missionId);
  });

  it("persists missions across reopen", () => {
    const created = repo.createMission({ goal: { title: "persist" }, params: {} });
    const db = openKernelDatabase(dbPath);
    const repo2 = new MissionRepository(db);
    const loaded = repo2.getMission(created.mission.missionId);
    expect(loaded?.missionId).toBe(created.mission.missionId);
  });
});
