import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import type { GovernanceDecision, Mission, MissionSignals } from "@sim-corp/schemas";

export type MissionStatus = "PENDING" | "RUNNING" | "RETRY" | "DONE" | "FAILED" | "QUARANTINED" | "BLOCKED" | "CANCELED";

interface MissionRow {
  id: string;
  goal: string;
  status: MissionStatus;
  subject_id: string | null;
  context_json: string | null;
  signals_json: string | null;
  governance_json: string | null;
  params_json: string | null;
  idempotency_key: string;
  attempts: number;
  max_attempts: number;
  next_retry_at: string | null;
  last_error_json: string | null;
  created_at: string;
  updated_at: string;
  claimed_by: string | null;
  claimed_at: string | null;
  lease_id: string | null;
  lease_expires_at: string | null;
  last_heartbeat_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
  result_json: string | null;
}

export interface MissionRecord extends Mission {
  missionId: string;
  status: MissionStatus;
  subjectId?: string;
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: string;
  claimedBy?: string;
  claimedAt?: string;
  leaseId?: string;
  leaseExpiresAt?: string;
  lastHeartbeatAt?: string;
  completedAt?: string;
  failedAt?: string;
  resultMeta?: Record<string, unknown>;
  lastError?: Record<string, unknown>;
  governance?: GovernanceDecision;
  signals?: MissionSignals;
  updatedAt: string;
  createdAt: string;
}

export interface MissionCreateInput extends Mission {
  status?: MissionStatus;
  idempotencyKey?: string;
  maxAttempts?: number;
  nextRetryAt?: string;
  governance?: GovernanceDecision;
  signals?: MissionSignals;
}

export interface ClaimOptions {
  agentName: string;
  goals?: string[];
  nowIso: string;
  leaseDurationMs: number;
}

export interface FailOptions {
  missionId: string;
  retryable: boolean;
  error: Record<string, unknown>;
  nowIso: string;
  leaseId?: string;
  backoffMs: number;
}

export class MissionRepository {
  constructor(private readonly db: Database.Database) {}

  createMission(input: MissionCreateInput): {
    mission: MissionRecord;
    created: boolean;
  } {
    const now = new Date().toISOString();
    const id = input.missionId ?? input.id ?? this.generateMissionId();
    const goal = this.normalizeGoal(input.goal);
    const idempotencyKey = input.idempotencyKey ?? id;
    const paramsJson = JSON.stringify(input.params ?? {}) ?? "{}";
    const contextJson = input.context ? JSON.stringify(input.context) : null;
    const signalsJson = input.signals ? JSON.stringify(input.signals) : null;
    const governanceJson = input.governance ? JSON.stringify(input.governance) : null;
    const status: MissionStatus = input.status ?? "PENDING";
    const nextRetryAt = input.nextRetryAt ?? null;
    const maxAttempts = Number.isInteger(input.maxAttempts) && (input.maxAttempts as number) > 0 ? (input.maxAttempts as number) : 5;

    const stmt = this.db.prepare(
      `INSERT INTO missions (id, goal, status, subject_id, context_json, signals_json, governance_json, params_json, idempotency_key, attempts, max_attempts, next_retry_at, created_at, updated_at, last_error_json, result_json)
       VALUES (@id, @goal, @status, @subjectId, @contextJson, @signalsJson, @governanceJson, @paramsJson, @idempotencyKey, 0, @maxAttempts, @nextRetryAt, @createdAt, @updatedAt, @lastErrorJson, @resultJson)`
    );
    try {
      stmt.run({
        id,
        goal,
        status,
        subjectId: input.subjectId ?? null,
        contextJson,
        signalsJson,
        governanceJson,
        paramsJson: paramsJson,
        idempotencyKey,
        maxAttempts,
        nextRetryAt,
        createdAt: input.createdAt ?? now,
        updatedAt: now,
        lastErrorJson: null,
        resultJson: null
      });
      const row = this.getMissionRowById(id);
      if (!row) throw new Error("failed to fetch created mission");
      return { mission: this.mapRow(row), created: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/UNIQUE constraint failed: missions.idempotency_key/.test(message)) {
        throw err;
      }
      const existing = this.getMissionByIdempotencyKey(idempotencyKey);
      if (!existing) {
        throw err;
      }
      return { mission: existing, created: false };
    }
  }

  getMission(id: string): MissionRecord | null {
    const row = this.getMissionRowById(id);
    return row ? this.mapRow(row) : null;
  }

  listMissions(filters: {
    status?: MissionStatus;
    goal?: string;
    agent?: string;
    subjectId?: string;
    limit?: number;
    offset?: number;
  } = {}): MissionRecord[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.status) {
      conditions.push("status = @status");
      params.status = filters.status;
    }
    if (filters.goal) {
      conditions.push("goal = @goal");
      params.goal = this.normalizeGoal(filters.goal);
    }
    if (filters.agent) {
      conditions.push("claimed_by = @agent");
      params.agent = filters.agent;
    }
    if (filters.subjectId) {
      conditions.push("subject_id = @subjectId");
      params.subjectId = filters.subjectId;
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = Number.isInteger(filters.limit) ? (filters.limit as number) : 100;
    const offset = Number.isInteger(filters.offset) ? (filters.offset as number) : 0;
    const rows = this.db
      .prepare(
        `SELECT * FROM missions ${where}
         ORDER BY created_at ASC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset }) as MissionRow[];
    return rows.map((row) => this.mapRow(row));
  }

  claimNext(options: ClaimOptions): MissionRecord | null {
    const { agentName, goals, nowIso, leaseDurationMs } = options;
    const now = nowIso;
    const leaseExpiresAt = new Date(new Date(now).getTime() + leaseDurationMs).toISOString();
    const leaseId = this.generateLeaseId();
    const goalFilter = goals && goals.length ? goals.map((g) => this.normalizeGoal(g)) : null;

    const runnableQuery = `
      SELECT id FROM missions
      WHERE
        (
          status = 'PENDING'
        ) OR (
          status = 'RETRY' AND (next_retry_at IS NULL OR next_retry_at <= @now)
        ) OR (
          status = 'RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= @now
        )
        ${goalFilter ? "AND goal IN (" + goalFilter.map((_, idx) => `@goal${idx}`).join(",") + ")" : ""}
      ORDER BY
        CASE status WHEN 'PENDING' THEN 0 WHEN 'RETRY' THEN 1 ELSE 2 END,
        CASE status WHEN 'RETRY' THEN next_retry_at ELSE created_at END ASC,
        created_at ASC
      LIMIT 1
    `;

    const candidateStmt = this.db.prepare(runnableQuery);

    const params: Record<string, unknown> = { now };
    if (goalFilter) {
      goalFilter.forEach((g, idx) => {
        params[`goal${idx}`] = g;
      });
    }

    const result = this.db.transaction(() => {
      const candidate = candidateStmt.get(params) as { id: string } | undefined;
      if (!candidate) return null;
      const update = this.db
        .prepare(
          `UPDATE missions
           SET status='RUNNING',
               claimed_by=@agentName,
               claimed_at=@now,
               lease_id=@leaseId,
               lease_expires_at=@leaseExpiresAt,
               last_heartbeat_at=@now,
               attempts=attempts+1,
               next_retry_at=NULL,
               updated_at=@now
           WHERE id=@id AND (
             status='PENDING' OR
             (status='RETRY' AND (next_retry_at IS NULL OR next_retry_at <= @now)) OR
             (status='RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= @now)
           )`
        )
        .run({
          id: candidate.id,
          agentName,
          now,
          leaseId,
          leaseExpiresAt
        });
      if (update.changes !== 1) {
        return null;
      }
      const row = this.getMissionRowById(candidate.id);
      return row ? this.mapRow(row) : null;
    })();

    return result;
  }

  heartbeat(missionId: string, leaseId: string, nowIso: string): MissionRecord {
    const mission = this.getMissionRowById(missionId);
    if (!mission) throw new Error("Mission not found");
    if (mission.status !== "RUNNING") {
      throw new Error("Mission is not running");
    }
    // allow heartbeats to extend lease even if client provided a stale leaseId, as long as mission is running
    const leaseDurationMs = mission.leaseExpiresAt
      ? new Date(mission.leaseExpiresAt).getTime() - new Date(mission.claimedAt ?? nowIso).getTime()
      : 30_000;
    const leaseExpiresAt = new Date(new Date(nowIso).getTime() + leaseDurationMs).toISOString();
    this.db
      .prepare(
        `UPDATE missions
         SET lease_expires_at=@leaseExpiresAt, last_heartbeat_at=@now, updated_at=@now
         WHERE id=@id AND lease_id=@leaseId`
      )
      .run({ id: missionId, leaseId, now: nowIso, leaseExpiresAt });
    const row = this.getMissionRowById(missionId);
    if (!row) throw new Error("Mission not found");
    return this.mapRow(row);
  }

  completeMission(missionId: string, summary: Record<string, unknown> | undefined, leaseId?: string): MissionRecord {
    const now = new Date().toISOString();
    const mission = this.getMissionRowById(missionId);
    if (!mission) throw new Error("Mission not found");
    if (mission.status !== "RUNNING") {
      throw new Error("Mission is not running");
    }
    if (mission.leaseId && leaseId && mission.leaseId !== leaseId) {
      throw new Error("Lease mismatch");
    }
    this.db
      .prepare(
        `UPDATE missions
         SET status='DONE', result_json=@resultJson, completed_at=@now, updated_at=@now,
             claimed_by=NULL, lease_id=NULL, lease_expires_at=NULL, last_heartbeat_at=NULL
         WHERE id=@id`
      )
      .run({
        id: missionId,
        resultJson: summary ? JSON.stringify(summary) : null,
        now
      });
    const row = this.getMissionRowById(missionId);
    if (!row) throw new Error("Mission not found");
    return this.mapRow(row);
  }

  failMission(options: FailOptions): MissionRecord {
    const mission = this.getMissionRowById(options.missionId);
    if (!mission) throw new Error("Mission not found");
    if (mission.status !== "RUNNING") {
      throw new Error("Mission is not running");
    }
    if (mission.leaseId && options.leaseId && mission.leaseId !== options.leaseId) {
      throw new Error("Lease mismatch");
    }
    const attempts = mission.attempts + 1;
    const maxAttempts = mission.max_attempts || 5;
    const now = options.nowIso;
    const retryable = options.retryable && attempts < maxAttempts;
    const nextRetryAt = retryable
      ? new Date(new Date(now).getTime() + this.computeBackoffMs(options.backoffMs, attempts)).toISOString()
      : null;
    const status: MissionStatus = retryable ? "RETRY" : "FAILED";
    this.db
      .prepare(
        `UPDATE missions
         SET status=@status,
             attempts=@attempts,
             next_retry_at=@nextRetryAt,
             last_error_json=@error,
             failed_at=${retryable ? "failed_at" : "@now"},
             claimed_by=NULL,
             claimed_at=NULL,
             lease_id=NULL,
             lease_expires_at=NULL,
             last_heartbeat_at=NULL,
             updated_at=@now
         WHERE id=@id`
      )
      .run({
        id: options.missionId,
        status,
        attempts,
        nextRetryAt,
        error: JSON.stringify(options.error),
        now
      });
    const row = this.getMissionRowById(options.missionId);
    if (!row) throw new Error("Mission not found");
    return this.mapRow(row);
  }

  approveMission(missionId: string, decision: GovernanceDecision, nowIso: string): MissionRecord {
    const mission = this.getMissionRowById(missionId);
    if (!mission) throw new Error("Mission not found");
    if (mission.status !== "QUARANTINED") {
      throw new Error("Mission is not quarantined");
    }
    this.db
      .prepare(
        `UPDATE missions
         SET status='PENDING',
             governance_json=@governanceJson,
             next_retry_at=NULL,
             claimed_by=NULL,
             claimed_at=NULL,
             lease_id=NULL,
             lease_expires_at=NULL,
             last_heartbeat_at=NULL,
             updated_at=@now
         WHERE id=@id`
      )
      .run({
        id: missionId,
        governanceJson: JSON.stringify(decision),
        now: nowIso
      });
    const row = this.getMissionRowById(missionId);
    if (!row) throw new Error("Mission not found");
    return this.mapRow(row);
  }

  cancelMission(missionId: string, nowIso: string): MissionRecord {
    const mission = this.getMissionRowById(missionId);
    if (!mission) throw new Error("Mission not found");
    this.db
      .prepare(
        `UPDATE missions
         SET status='CANCELED',
             next_retry_at=NULL,
             claimed_by=NULL,
             claimed_at=NULL,
             lease_id=NULL,
             lease_expires_at=NULL,
             last_heartbeat_at=NULL,
             updated_at=@now
         WHERE id=@id`
      )
      .run({ id: missionId, now: nowIso });
    const row = this.getMissionRowById(missionId);
    if (!row) throw new Error("Mission not found");
    return this.mapRow(row);
  }

  metrics(): Record<MissionStatus, number> & {
    total: number;
    quarantined_total: number;
    blocked_total: number;
    approved_total: number;
    rate_limited_total: number;
  } {
    const counts: Record<MissionStatus, number> = {
      PENDING: 0,
      RUNNING: 0,
      RETRY: 0,
      DONE: 0,
      FAILED: 0,
      QUARANTINED: 0,
      BLOCKED: 0,
      CANCELED: 0
    };
    const stmt = this.db.prepare(`SELECT status, COUNT(*) as count FROM missions GROUP BY status`);
    for (const row of stmt.all() as Array<{ status: MissionStatus; count: number }>) {
      counts[row.status] = row.count;
    }
    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
    const extras = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN status='QUARANTINED' THEN 1 ELSE 0 END) as quarantined_total,
           SUM(CASE WHEN status='BLOCKED' THEN 1 ELSE 0 END) as blocked_total,
           SUM(CASE WHEN governance_json LIKE '%RATE_LIMITED%' THEN 1 ELSE 0 END) as rate_limited_total,
           SUM(CASE WHEN governance_json LIKE '%\"decidedBy\":\"HUMAN\"%' THEN 1 ELSE 0 END) as approved_total
         FROM missions`
      )
      .get() as { quarantined_total?: number; blocked_total?: number; rate_limited_total?: number; approved_total?: number };
    return {
      total,
      ...counts,
      quarantined_total: Number(extras?.quarantined_total ?? 0),
      blocked_total: Number(extras?.blocked_total ?? 0),
      rate_limited_total: Number(extras?.rate_limited_total ?? 0),
      approved_total: Number(extras?.approved_total ?? 0)
    };
  }

  private getMissionRowById(id: string): MissionRow | null {
    const row = this.db.prepare(`SELECT * FROM missions WHERE id = @id LIMIT 1`).get({ id }) as MissionRow | undefined;
    return row ?? null;
  }

  private getMissionByIdempotencyKey(idempotencyKey: string): MissionRecord | null {
    const row = this.db
      .prepare(`SELECT * FROM missions WHERE idempotency_key = @idempotencyKey LIMIT 1`)
      .get({ idempotencyKey }) as MissionRow | undefined;
    return row ? this.mapRow(row) : null;
  }

  private mapRow(row: MissionRow): MissionRecord {
    return {
      missionId: row.id,
      id: row.id,
      goal: { title: row.goal },
      params: row.params_json ? JSON.parse(row.params_json) : {},
      context: row.context_json ? (JSON.parse(row.context_json) as Record<string, unknown>) : {},
      subjectId: row.subject_id ?? undefined,
      constraints: [],
      priority: "MEDIUM",
      signals: row.signals_json ? (JSON.parse(row.signals_json) as MissionSignals) : undefined,
      governance: row.governance_json ? (JSON.parse(row.governance_json) as GovernanceDecision) : undefined,
      status: row.status,
      idempotencyKey: row.idempotency_key,
      attempts: row.attempts,
      maxAttempts: row.max_attempts || 5,
      nextRetryAt: row.next_retry_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      claimedBy: row.claimed_by ?? undefined,
      claimedAt: row.claimed_at ?? undefined,
      leaseId: row.lease_id ?? undefined,
      leaseExpiresAt: row.lease_expires_at ?? undefined,
      lastHeartbeatAt: row.last_heartbeat_at ?? undefined,
      completedAt: row.completed_at ?? undefined,
      failedAt: row.failed_at ?? undefined,
      resultMeta: row.result_json ? (JSON.parse(row.result_json) as Record<string, unknown>) : undefined,
      lastError: row.last_error_json ? (JSON.parse(row.last_error_json) as Record<string, unknown>) : undefined
    };
  }

  private normalizeGoal(goal: Mission["goal"]): string {
    if (typeof goal === "string") return goal;
    if (goal && typeof goal === "object" && "title" in goal) {
      return (goal as { title: string }).title;
    }
    return "unknown";
  }

  private generateMissionId(): string {
    const rand = randomBytes(4).toString("hex");
    const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
    return `M-${ts}-${rand}`;
  }

  private generateLeaseId(): string {
    return randomBytes(4).toString("hex");
  }

  private computeBackoffMs(base: number, attempt: number): number {
    const exp = Math.max(0, attempt - 1);
    return base * Math.pow(2, exp);
  }
}
