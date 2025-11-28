import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { MissionStore } from "../src/core/mission-store";
import { openKernelDatabase } from "../src/db/connection";
import { MissionRepository } from "../src/db/repo";

describe("MissionStore", () => {
  let store: MissionStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(os.tmpdir(), `kernel-store-${Date.now()}.db`);
    const db = openKernelDatabase(dbPath);
    store = new MissionStore(new MissionRepository(db), { leaseDurationMs: 1, baseBackoffMs: 5 });
  });

  afterEach(() => {
    if (dbPath && fs.existsSync(dbPath)) {
      fs.rmSync(dbPath, { force: true });
    }
  });

  it("reclaims expired leases and marks exhausted missions failed", () => {
    const { mission } = store.createMission({ goal: { title: "demo" }, params: {}, maxAttempts: 1 });

    const claimed = store.claimNext("worker-1", undefined, new Date());
    expect(claimed?.status).toBe("RUNNING");
    expect(claimed?.leaseId).toBeTruthy();

    const reclaimed = store.claimNext("worker-2", undefined, new Date(Date.now() + 10));
    expect(reclaimed?.claimedBy).toBe("worker-2");
    expect(reclaimed?.status).toBe("RUNNING");
  });

  it("schedules retries with backoff", () => {
    store.createMission({ goal: { title: "demo" }, params: {} });

    const claimed = store.claimNext("worker-1", undefined, new Date());
    expect(claimed?.status).toBe("RUNNING");
    const retried = store.failMission(claimed!.missionId, { error: "boom" }, { retryable: true, leaseId: claimed?.leaseId });

    expect(retried.status).toBe("RETRY");
    expect(retried.nextRetryAt).toBeDefined();
  });
});
