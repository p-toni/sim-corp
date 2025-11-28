import { MissionSchema, type Mission } from "@sim-corp/schemas";

export type MissionStatus = "PENDING" | "RUNNING" | "DONE" | "FAILED";

export interface MissionRecord extends Mission {
  missionId: string;
  idempotencyKey?: string;
  status: MissionStatus;
  createdAt: string;
  updatedAt: string;
  claimedBy?: string;
  claimedAt?: string;
  leaseId?: string;
  leaseExpiresAt?: string;
  lastHeartbeatAt?: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string;
  resultMeta?: Record<string, unknown>;
  errorMeta?: { error: string; details?: Record<string, unknown> };
}

interface MissionFilters {
  status?: MissionStatus;
  goal?: string;
  agent?: string;
  sessionId?: string;
}

interface MissionStoreOptions {
  leaseDurationMs?: number;
  maxAttempts?: number;
  baseBackoffMs?: number;
}

interface MissionCreateResult {
  mission: MissionRecord;
  created: boolean;
}

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 2_000;

export class MissionStore {
  private missions: MissionRecord[] = [];
  private readonly leaseDurationMs: number;
  private readonly defaultMaxAttempts: number;
  private readonly backoffMs: number;

  constructor(options: MissionStoreOptions = {}) {
    this.leaseDurationMs = options.leaseDurationMs ?? DEFAULT_LEASE_MS;
    this.defaultMaxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.backoffMs = options.baseBackoffMs ?? DEFAULT_BACKOFF_MS;
  }

  createMission(mission: Mission): MissionCreateResult {
    const idempotencyKey = (mission as MissionRecord).idempotencyKey;
    if (idempotencyKey) {
      const existing = this.missions.find((m) => m.idempotencyKey === idempotencyKey);
      if (existing) {
        return { mission: { ...existing }, created: false };
      }
    }

    const normalizedGoal = this.normalizeGoal(mission.goal);
    const parsed = MissionSchema.parse({
      ...mission,
      missionId: mission.missionId ?? mission.id,
      goal: normalizedGoal
    });
    const missionId = parsed.missionId ?? parsed.id ?? this.generateMissionId();
    const now = new Date().toISOString();
    const maxAttempts = this.resolveMaxAttempts(mission);
    const record: MissionRecord = {
      ...parsed,
      missionId,
      id: parsed.id ?? missionId,
      status: "PENDING",
      idempotencyKey,
      createdAt: parsed.createdAt ?? now,
      updatedAt: now,
      attempts: 0,
      maxAttempts
    };
    this.missions.push(record);
    return { mission: { ...record }, created: true };
  }

  listMissions(filter: MissionFilters = {}): MissionRecord[] {
    return this.missions
      .filter((mission) => this.matchesFilter(mission, filter))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((mission) => ({ ...mission }));
  }

  claimNext(agentName: string, goals?: string[], now: Date = new Date()): MissionRecord | null {
    const goalSet = goals && goals.length ? new Set(goals) : null;
    const nowIso = now.toISOString();
    const next = this.missions.find((mission) => this.isClaimable(mission, goalSet, nowIso));
    if (!next) return null;
    return { ...this.startLease(next, agentName, nowIso) };
  }

  heartbeatMission(id: string, leaseId: string, agentName?: string): MissionRecord {
    const mission = this.ensureMission(id);
    if (mission.status !== "RUNNING") {
      throw new Error("Mission is not running");
    }
    this.ensureLease(mission, leaseId, agentName);
    const nowIso = new Date().toISOString();
    mission.lastHeartbeatAt = nowIso;
    mission.leaseExpiresAt = this.computeLeaseExpiry(nowIso);
    mission.updatedAt = nowIso;
    return { ...mission };
  }

  completeMission(id: string, resultMeta?: Record<string, unknown>, leaseId?: string): MissionRecord {
    const mission = this.ensureMission(id);
    this.ensureLease(mission, leaseId);
    mission.status = "DONE";
    mission.resultMeta = resultMeta;
    this.clearLease(mission);
    mission.updatedAt = new Date().toISOString();
    return { ...mission };
  }

  failMission(
    id: string,
    error: { error: string; details?: Record<string, unknown> },
    options: { retryable?: boolean; leaseId?: string } = {}
  ): MissionRecord {
    const mission = this.ensureMission(id);
    this.ensureLease(mission, options.leaseId);
    const nowIso = new Date().toISOString();
    const retryable = Boolean(options.retryable) && mission.attempts < mission.maxAttempts;
    mission.status = retryable ? "PENDING" : "FAILED";
    mission.nextRetryAt = retryable ? this.computeNextRetry(nowIso, mission.attempts) : undefined;
    this.clearLease(mission);
    mission.errorMeta = error;
    mission.updatedAt = nowIso;
    return { ...mission };
  }

  getMission(id: string): MissionRecord | null {
    const mission = this.missions.find((m) => m.missionId === id || m.id === id);
    return mission ? { ...mission } : null;
  }

  metrics(): Record<MissionStatus, number> & { total: number } {
    const totals: Record<MissionStatus, number> = {
      PENDING: 0,
      RUNNING: 0,
      DONE: 0,
      FAILED: 0
    };
    for (const mission of this.missions) {
      totals[mission.status] += 1;
    }
    return { total: this.missions.length, ...totals };
  }

  private ensureMission(id: string): MissionRecord {
    const mission = this.getMission(id);
    if (!mission) {
      throw new Error("Mission not found");
    }
    return this.missions.find((m) => m.missionId === mission.missionId || m.id === mission.id) as MissionRecord;
  }

  private ensureLease(mission: MissionRecord, leaseId?: string, agentName?: string): void {
    if (mission.status === "PENDING") return;
    if (!mission.leaseId) {
      throw new Error("Mission lease missing");
    }
    if (leaseId && mission.leaseId !== leaseId) {
      throw new Error("Lease mismatch");
    }
    if (agentName && mission.claimedBy && mission.claimedBy !== agentName) {
      throw new Error("Mission claimed by another agent");
    }
  }

  private goalName(mission: Mission): string {
    const goal = mission.goal as string | { title?: string };
    if (typeof goal === "string") return goal;
    return goal?.title ?? "unknown";
  }

  private normalizeGoal(goal: Mission["goal"]): Mission["goal"] {
    if (typeof goal === "string") {
      return { title: goal };
    }
    if (goal && typeof goal === "object" && "title" in goal) {
      return goal;
    }
    throw new Error("Invalid mission goal");
  }

  private generateMissionId(): string {
    const rand = Math.random().toString(36).slice(2, 8);
    const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    return `M-${ts}-${rand}`;
  }

  private generateLeaseId(): string {
    return Math.random().toString(36).slice(2, 10);
  }

  private resolveMaxAttempts(mission: Mission): number {
    const requested = (mission as MissionRecord).maxAttempts;
    if (typeof requested === "number" && Number.isInteger(requested) && requested > 0) {
      return requested;
    }
    return this.defaultMaxAttempts;
  }

  private matchesFilter(mission: MissionRecord, filter: MissionFilters): boolean {
    if (filter.status && mission.status !== filter.status) return false;
    if (filter.goal && this.goalName(mission) !== filter.goal) return false;
    if (filter.agent && mission.claimedBy !== filter.agent) return false;
    if (filter.sessionId && (mission.params as { sessionId?: string })?.sessionId !== filter.sessionId) {
      return false;
    }
    return true;
  }

  private isClaimable(mission: MissionRecord, goalSet: Set<string> | null, nowIso: string): boolean {
    if (mission.status === "DONE" || mission.status === "FAILED") return false;
    if (mission.attempts >= mission.maxAttempts) {
      this.failExhausted(mission, nowIso);
      return false;
    }
    if (goalSet && !goalSet.has(this.goalName(mission))) return false;
    if (mission.nextRetryAt && mission.nextRetryAt > nowIso) return false;
    if (mission.status === "RUNNING" && !this.isLeaseExpired(mission, nowIso)) return false;
    return mission.status === "PENDING" || mission.status === "RUNNING";
  }

  private startLease(mission: MissionRecord, agentName: string, nowIso: string): MissionRecord {
    mission.status = "RUNNING";
    mission.claimedBy = agentName;
    mission.claimedAt = nowIso;
    mission.attempts += 1;
    mission.nextRetryAt = undefined;
    mission.leaseId = this.generateLeaseId();
    mission.leaseExpiresAt = this.computeLeaseExpiry(nowIso);
    mission.lastHeartbeatAt = nowIso;
    mission.updatedAt = nowIso;
    return mission;
  }

  private clearLease(mission: MissionRecord): void {
    mission.claimedBy = undefined;
    mission.claimedAt = undefined;
    mission.leaseId = undefined;
    mission.leaseExpiresAt = undefined;
    mission.lastHeartbeatAt = undefined;
  }

  private isLeaseExpired(mission: MissionRecord, nowIso: string): boolean {
    if (!mission.leaseExpiresAt) return true;
    return mission.leaseExpiresAt <= nowIso;
  }

  private computeLeaseExpiry(nowIso: string): string {
    const now = new Date(nowIso).getTime();
    return new Date(now + this.leaseDurationMs).toISOString();
  }

  private computeNextRetry(nowIso: string, attempts: number): string {
    const delay = this.backoffMs * Math.pow(2, Math.max(0, attempts - 1));
    const now = new Date(nowIso).getTime();
    return new Date(now + delay).toISOString();
  }

  private failExhausted(mission: MissionRecord, nowIso: string): void {
    if (mission.status === "FAILED") return;
    mission.status = "FAILED";
    mission.errorMeta = mission.errorMeta ?? { error: "max-attempts-exceeded" };
    mission.updatedAt = nowIso;
  }
}
