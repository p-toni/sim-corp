import { randomBytes } from "node:crypto";
import type { Database } from "@sim-corp/database";
import type { Actor, GovernanceDecision, Mission, MissionSignals } from "@sim-corp/schemas";

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
  actor_json: string | null;
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
  actor?: Actor;
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
  constructor(private readonly db: Database) {}

  async createMission(input: MissionCreateInput, actor?: Actor): Promise<{
    mission: MissionRecord;
    created: boolean;
  }> {
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
      `INSERT INTO missions (id, goal, status, subject_id, context_json, signals_json, governance_json, params_json, idempotency_key, attempts, max_attempts, next_retry_at, created_at, updated_at, last_error_json, result_json, actor_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)`
    );
    try {
      await stmt.run([
        id,
        goal,
        status,
        input.subjectId ?? null,
        contextJson,
        signalsJson,
        governanceJson,
        paramsJson,
        idempotencyKey,
        maxAttempts,
        nextRetryAt,
        input.createdAt ?? now,
        now,
        null, // lastErrorJson
        null, // resultJson
        actor ? JSON.stringify(actor) : null
      ]);
      const row = await this.getMissionRowById(id);
      if (!row) throw new Error("failed to fetch created mission");
      return { mission: this.mapRow(row), created: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/UNIQUE constraint failed: missions.idempotency_key/.test(message) &&
          !/duplicate key value violates unique constraint/.test(message)) {
        throw err;
      }
      const existing = await this.getMissionByIdempotencyKey(idempotencyKey);
      if (!existing) {
        throw err;
      }
      return { mission: existing, created: false };
    }
  }

  async getMission(id: string): Promise<MissionRecord | null> {
    const row = await this.getMissionRowById(id);
    return row ? this.mapRow(row) : null;
  }

  async listMissions(filters: {
    statuses?: MissionStatus[];
    goal?: string;
    agent?: string;
    subjectId?: string;
    sessionId?: string;
    orgId?: string;
    siteId?: string;
    machineId?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<MissionRecord[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    const statuses = Array.isArray(filters.statuses) ? filters.statuses.filter(Boolean) : [];
    if (statuses.length > 0) {
      const placeholders = statuses.map(() => '?');
      conditions.push(`status IN (${placeholders.join(",")})`);
      params.push(...statuses);
    }
    if (filters.goal) {
      conditions.push("goal = ?");
      params.push(this.normalizeGoal(filters.goal));
    }
    if (filters.agent) {
      conditions.push("claimed_by = ?");
      params.push(filters.agent);
    }
    if (filters.subjectId) {
      conditions.push("subject_id = ?");
      params.push(filters.subjectId);
    }
    if (filters.sessionId) {
      conditions.push("json_extract(params_json, '$.sessionId') = ?");
      params.push(filters.sessionId);
    }
    if (filters.orgId) {
      conditions.push("json_extract(context_json, '$.orgId') = ?");
      params.push(filters.orgId);
    }
    if (filters.siteId) {
      conditions.push("json_extract(context_json, '$.siteId') = ?");
      params.push(filters.siteId);
    }
    if (filters.machineId) {
      conditions.push("json_extract(context_json, '$.machineId') = ?");
      params.push(filters.machineId);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const requestedLimit = Number.isInteger(filters.limit) ? (filters.limit as number) : 50;
    const limit = Math.min(Math.max(requestedLimit, 1), 200);
    const offset = Number.isInteger(filters.offset) ? (filters.offset as number) : 0;

    const result = await this.db.query<MissionRow>(
      `SELECT * FROM missions ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return result.rows.map((row) => this.mapRow(row));
  }

  async claimNext(options: ClaimOptions): Promise<MissionRecord | null> {
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
          status = 'RETRY' AND (next_retry_at IS NULL OR next_retry_at <= ?)
        ) OR (
          status = 'RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
        ${goalFilter ? "AND goal IN (" + goalFilter.map(() => '?').join(",") + ")" : ""}
      ORDER BY
        CASE status WHEN 'PENDING' THEN 0 WHEN 'RETRY' THEN 1 ELSE 2 END,
        CASE status WHEN 'RETRY' THEN next_retry_at ELSE created_at END ASC,
        created_at ASC
      LIMIT 1
    `;

    const params: unknown[] = [now, now];
    if (goalFilter) {
      params.push(...goalFilter);
    }

    return await this.db.withTransaction(async (tx) => {
      const candidateResult = await tx.query<{ id: string }>(runnableQuery, params);
      const candidate = candidateResult.rows[0];
      if (!candidate) return null;

      const updateResult = await tx.exec(
        `UPDATE missions
         SET status='RUNNING',
             claimed_by=?,
             claimed_at=?,
             lease_id=?,
             lease_expires_at=?,
             last_heartbeat_at=?,
             attempts=attempts+1,
             next_retry_at=NULL,
             updated_at=?
         WHERE id=? AND (
           status='PENDING' OR
           (status='RETRY' AND (next_retry_at IS NULL OR next_retry_at <= ?)) OR
           (status='RUNNING' AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?)
         )`,
        [agentName, now, leaseId, leaseExpiresAt, now, now, candidate.id, now, now]
      );

      if (updateResult.changes !== 1) {
        return null;
      }

      const row = await this.getMissionRowById(candidate.id);
      return row ? this.mapRow(row) : null;
    });
  }

  async heartbeat(missionId: string, leaseId: string, nowIso: string): Promise<MissionRecord> {
    const mission = await this.getMissionRowById(missionId);
    if (!mission) throw new Error("Mission not found");
    if (mission.status !== "RUNNING") {
      throw new Error("Mission is not running");
    }
    // allow heartbeats to extend lease even if client provided a stale leaseId, as long as mission is running
    const leaseDurationMs = mission.lease_expires_at
      ? new Date(mission.lease_expires_at).getTime() - new Date(mission.claimed_at ?? nowIso).getTime()
      : 30_000;
    const leaseExpiresAt = new Date(new Date(nowIso).getTime() + leaseDurationMs).toISOString();
    await this.db.exec(
      `UPDATE missions
       SET lease_expires_at=?, last_heartbeat_at=?, updated_at=?
       WHERE id=? AND lease_id=?`,
      [leaseExpiresAt, nowIso, nowIso, missionId, leaseId]
    );
    const row = await this.getMissionRowById(missionId);
    if (!row) throw new Error("Mission not found");
    return this.mapRow(row);
  }

  async completeMission(missionId: string, summary: Record<string, unknown> | undefined, leaseId?: string): Promise<MissionRecord> {
    const now = new Date().toISOString();
    const mission = await this.getMissionRowById(missionId);
    if (!mission) throw new Error("Mission not found");
    if (mission.status !== "RUNNING") {
      throw new Error("Mission is not running");
    }
    if (mission.lease_id && leaseId && mission.lease_id !== leaseId) {
      throw new Error("Lease mismatch");
    }
    await this.db.exec(
      `UPDATE missions
       SET status='DONE', result_json=?, completed_at=?, updated_at=?,
           claimed_by=NULL, lease_id=NULL, lease_expires_at=NULL, last_heartbeat_at=NULL
       WHERE id=?`,
      [summary ? JSON.stringify(summary) : null, now, now, missionId]
    );
    const row = await this.getMissionRowById(missionId);
    if (!row) throw new Error("Mission not found");
    return this.mapRow(row);
  }

  async failMission(options: FailOptions): Promise<MissionRecord> {
    const mission = await this.getMissionRowById(options.missionId);
    if (!mission) throw new Error("Mission not found");
    if (mission.status !== "RUNNING") {
      throw new Error("Mission is not running");
    }
    if (mission.lease_id && options.leaseId && mission.lease_id !== options.leaseId) {
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
    await this.db.exec(
      `UPDATE missions
       SET status=?,
           attempts=?,
           next_retry_at=?,
           last_error_json=?,
           failed_at=${retryable ? "failed_at" : "?"},
           claimed_by=NULL,
           claimed_at=NULL,
           lease_id=NULL,
           lease_expires_at=NULL,
           last_heartbeat_at=NULL,
           updated_at=?
       WHERE id=?`,
      retryable
        ? [status, attempts, nextRetryAt, JSON.stringify(options.error), now, options.missionId]
        : [status, attempts, nextRetryAt, JSON.stringify(options.error), now, now, options.missionId]
    );
    const row = await this.getMissionRowById(options.missionId);
    if (!row) throw new Error("Mission not found");
    return this.mapRow(row);
  }

  async approveMission(missionId: string, decision: GovernanceDecision, nowIso: string, actor?: Actor): Promise<MissionRecord> {
    const mission = await this.getMissionRowById(missionId);
    if (!mission) throw new Error("Mission not found");
    if (mission.status !== "QUARANTINED") {
      throw new Error("Mission is not quarantined");
    }
    await this.db.exec(
      `UPDATE missions
       SET status='PENDING',
           governance_json=?,
           next_retry_at=NULL,
           claimed_by=NULL,
           claimed_at=NULL,
           lease_id=NULL,
           lease_expires_at=NULL,
           last_heartbeat_at=NULL,
           updated_at=?,
           actor_json=?
       WHERE id=?`,
      [JSON.stringify(decision), nowIso, actor ? JSON.stringify(actor) : null, missionId]
    );
    const row = await this.getMissionRowById(missionId);
    if (!row) throw new Error("Mission not found");
    return this.mapRow(row);
  }

  async cancelMission(missionId: string, nowIso: string, actor?: Actor): Promise<MissionRecord> {
    const mission = await this.getMissionRowById(missionId);
    if (!mission) throw new Error("Mission not found");
    await this.db.exec(
      `UPDATE missions
       SET status='CANCELED',
           next_retry_at=NULL,
           claimed_by=NULL,
           claimed_at=NULL,
           lease_id=NULL,
           lease_expires_at=NULL,
           last_heartbeat_at=NULL,
           updated_at=?,
           actor_json=?
       WHERE id=?`,
      [nowIso, actor ? JSON.stringify(actor) : null, missionId]
    );
    const row = await this.getMissionRowById(missionId);
    if (!row) throw new Error("Mission not found");
    return this.mapRow(row);
  }

  async retryNowMission(missionId: string, nowIso: string, actor?: Actor): Promise<MissionRecord> {
    const mission = await this.getMissionRowById(missionId);
    if (!mission) throw new Error("Mission not found");
    if (mission.status !== "RETRY") {
      throw new Error("Mission is not retryable now");
    }

    const governance = mission.governance_json ? (JSON.parse(mission.governance_json) as GovernanceDecision) : undefined;
    const reasons = governance?.reasons ?? [];
    const updatedGovernance: GovernanceDecision | undefined = {
      action: governance?.action ?? "ALLOW",
      confidence: governance?.confidence ?? "MED",
      reasons: [...reasons, { code: "MANUAL_RETRY_NOW", message: "Manual retry requested" }],
      decidedAt: governance?.decidedAt ?? nowIso,
      decidedBy: governance?.decidedBy ?? "HUMAN"
    };

    await this.db.exec(
      `UPDATE missions
       SET next_retry_at=?,
           governance_json=?,
           updated_at=?,
           actor_json=?
       WHERE id=? AND status='RETRY'`,
      [nowIso, JSON.stringify(updatedGovernance), nowIso, actor ? JSON.stringify(actor) : null, missionId]
    );
    const row = await this.getMissionRowById(missionId);
    if (!row) throw new Error("Mission not found");
    return this.mapRow(row);
  }

  async metrics(): Promise<Record<MissionStatus, number> & {
    total: number;
    quarantined_total: number;
    blocked_total: number;
    approved_total: number;
    rate_limited_total: number;
  }> {
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

    const countResult = await this.db.query<{ status: MissionStatus; count: number }>(
      `SELECT status, COUNT(*) as count FROM missions GROUP BY status`
    );

    for (const row of countResult.rows) {
      counts[row.status] = row.count;
    }

    const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

    const extrasResult = await this.db.query<{
      quarantined_total?: number;
      blocked_total?: number;
      rate_limited_total?: number;
      approved_total?: number;
    }>(`SELECT
         SUM(CASE WHEN status='QUARANTINED' THEN 1 ELSE 0 END) as quarantined_total,
         SUM(CASE WHEN status='BLOCKED' THEN 1 ELSE 0 END) as blocked_total,
         SUM(CASE WHEN governance_json LIKE '%RATE_LIMITED%' THEN 1 ELSE 0 END) as rate_limited_total,
         SUM(CASE WHEN governance_json LIKE '%"decidedBy":"HUMAN"%' THEN 1 ELSE 0 END) as approved_total
       FROM missions`
    );

    const extras = extrasResult.rows[0];

    return {
      total,
      ...counts,
      quarantined_total: Number(extras?.quarantined_total ?? 0),
      blocked_total: Number(extras?.blocked_total ?? 0),
      rate_limited_total: Number(extras?.rate_limited_total ?? 0),
      approved_total: Number(extras?.approved_total ?? 0)
    };
  }

  private async getMissionRowById(id: string): Promise<MissionRow | null> {
    const result = await this.db.query<MissionRow>(
      `SELECT * FROM missions WHERE id = ? LIMIT 1`,
      [id]
    );
    return result.rows[0] ?? null;
  }

  private async getMissionByIdempotencyKey(idempotencyKey: string): Promise<MissionRecord | null> {
    const result = await this.db.query<MissionRow>(
      `SELECT * FROM missions WHERE idempotency_key = ? LIMIT 1`,
      [idempotencyKey]
    );
    const row = result.rows[0];
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
      lastError: row.last_error_json ? (JSON.parse(row.last_error_json) as Record<string, unknown>) : undefined,
      actor: row.actor_json ? (JSON.parse(row.actor_json) as Actor) : undefined
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
