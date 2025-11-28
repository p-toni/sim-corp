import { describe, expect, it } from "vitest";
import { MissionStore } from "../src/core/mission-store";

describe("MissionStore", () => {
  it("reclaims expired leases and marks exhausted missions failed", () => {
    const store = new MissionStore({ leaseDurationMs: 1, maxAttempts: 1 });
    const { mission } = store.createMission({ goal: { title: "demo" }, params: {} });

    const claimed = store.claimNext("worker-1");
    expect(claimed?.status).toBe("RUNNING");
    expect(claimed?.leaseId).toBeTruthy();

    const reclaimed = store.claimNext("worker-2", undefined, new Date(Date.now() + 10));
    expect(reclaimed).toBeNull();

    const failed = store.listMissions({ status: "FAILED" });
    expect(failed).toHaveLength(1);
    expect(failed[0]?.missionId).toBe(mission.missionId);
  });

  it("schedules retries with backoff", () => {
    const store = new MissionStore({ baseBackoffMs: 5 });
    store.createMission({ goal: { title: "demo" }, params: {} });

    const claimed = store.claimNext("worker-1");
    expect(claimed?.status).toBe("RUNNING");
    const retried = store.failMission(claimed!.missionId, { error: "boom" }, { retryable: true, leaseId: claimed?.leaseId });

    expect(retried.status).toBe("PENDING");
    expect(retried.nextRetryAt).toBeDefined();
  });
});
