import type { Database } from "better-sqlite3";
import { RoastEventSchema, RoastSessionSchema, RoastSessionSummarySchema, TelemetryPointSchema } from "@sim-corp/schemas";
import type { RoastEvent, RoastSession, RoastSessionSummary, TelemetryPoint } from "@sim-corp/schemas";

export interface SessionFilters {
  orgId?: string;
  siteId?: string;
  machineId?: string;
  status?: "ACTIVE" | "CLOSED";
  limit?: number;
  offset?: number;
}

export class IngestionRepository {
  constructor(private readonly db: Database) {}

  upsertSession(session: RoastSessionSummary): void {
    const parsed = RoastSessionSummarySchema.parse(session);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO sessions (session_id, org_id, site_id, machine_id, started_at, ended_at, status, duration_seconds, fc_seconds, drop_seconds, max_bt_c, created_at)
         VALUES (@sessionId, @orgId, @siteId, @machineId, @startedAt, @endedAt, @status, @durationSeconds, @fcSeconds, @dropSeconds, @maxBtC, @createdAt)
         ON CONFLICT(session_id) DO UPDATE SET
           ended_at=excluded.ended_at,
           status=excluded.status,
           duration_seconds=excluded.duration_seconds,
           fc_seconds=excluded.fc_seconds,
           drop_seconds=excluded.drop_seconds,
           max_bt_c=excluded.max_bt_c`
      )
      .run({
        sessionId: parsed.sessionId,
        orgId: parsed.orgId,
        siteId: parsed.siteId,
        machineId: parsed.machineId,
        startedAt: parsed.startedAt,
        endedAt: parsed.endedAt,
        status: parsed.status,
        durationSeconds: parsed.durationSeconds ?? null,
        fcSeconds: parsed.fcSeconds ?? null,
        dropSeconds: parsed.dropSeconds ?? null,
        maxBtC: parsed.maxBtC ?? null,
        createdAt: now
      });
  }

  appendTelemetry(sessionId: string, point: TelemetryPoint): void {
    const parsed = TelemetryPointSchema.parse(point);
    this.db
      .prepare(
        `INSERT INTO telemetry_points (session_id, ts, elapsed_seconds, bt_c, et_c, ror_c_per_min, ambient_c, raw_json)
         VALUES (@sessionId, @ts, @elapsedSeconds, @btC, @etC, @rorCPerMin, @ambientC, @raw)`
      )
      .run({
        sessionId,
        ts: parsed.ts,
        elapsedSeconds: parsed.elapsedSeconds,
        btC: parsed.btC ?? null,
        etC: parsed.etC ?? null,
        rorCPerMin: parsed.rorCPerMin ?? null,
        ambientC: parsed.ambientC ?? null,
        raw: JSON.stringify(parsed)
      });
  }

  appendEvent(sessionId: string, event: RoastEvent): void {
    const parsed = RoastEventSchema.parse(event);
    this.db
      .prepare(
        `INSERT INTO events (session_id, ts, elapsed_seconds, type, raw_json)
         VALUES (@sessionId, @ts, @elapsedSeconds, @type, @raw)`
      )
      .run({
        sessionId,
        ts: parsed.ts,
        elapsedSeconds: parsed.payload?.elapsedSeconds ?? null,
        type: parsed.type,
        raw: JSON.stringify(parsed)
      });
  }

  listSessions(filters: SessionFilters = {}): RoastSessionSummary[] {
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.orgId) {
      conditions.push("org_id = @orgId");
      params.orgId = filters.orgId;
    }
    if (filters.siteId) {
      conditions.push("site_id = @siteId");
      params.siteId = filters.siteId;
    }
    if (filters.machineId) {
      conditions.push("machine_id = @machineId");
      params.machineId = filters.machineId;
    }
    if (filters.status) {
      conditions.push("status = @status");
      params.status = filters.status;
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = typeof filters.limit === "number" ? filters.limit : 50;
    const offset = typeof filters.offset === "number" ? filters.offset : 0;

    const rows = this.db
      .prepare(
        `SELECT session_id, org_id, site_id, machine_id, started_at, ended_at, status, duration_seconds, fc_seconds, drop_seconds, max_bt_c
         FROM sessions ${where}
         ORDER BY started_at DESC
         LIMIT @limit OFFSET @offset`
      )
      .all({ ...params, limit, offset });
    return rows.map((row) =>
      RoastSessionSummarySchema.parse({
        sessionId: row.session_id,
        orgId: row.org_id,
        siteId: row.site_id,
        machineId: row.machine_id,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        status: row.status,
        durationSeconds: row.duration_seconds ?? undefined,
        fcSeconds: row.fc_seconds ?? undefined,
        dropSeconds: row.drop_seconds ?? undefined,
        maxBtC: row.max_bt_c ?? undefined
      })
    );
  }

  getSession(sessionId: string): RoastSession | null {
    const row = this.db
      .prepare(
        `SELECT session_id, org_id, site_id, machine_id, started_at, ended_at, status, duration_seconds, fc_seconds, drop_seconds, max_bt_c
         FROM sessions WHERE session_id = @sessionId`
      )
      .get({ sessionId });
    if (!row) return null;
    return RoastSessionSchema.parse({
      sessionId: row.session_id,
      orgId: row.org_id,
      siteId: row.site_id,
      machineId: row.machine_id,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      status: row.status,
      durationSeconds: row.duration_seconds ?? undefined,
      fcSeconds: row.fc_seconds ?? undefined,
      dropSeconds: row.drop_seconds ?? undefined,
      maxBtC: row.max_bt_c ?? undefined
    });
  }

  getTelemetry(sessionId: string, limit = 2000, from?: number, to?: number): TelemetryPoint[] {
    const conditions = ["session_id = @sessionId"];
    const params: Record<string, unknown> = { sessionId, limit };
    if (typeof from === "number") {
      conditions.push("elapsed_seconds >= @from");
      params.from = from;
    }
    if (typeof to === "number") {
      conditions.push("elapsed_seconds <= @to");
      params.to = to;
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const rows = this.db
      .prepare(
        `SELECT raw_json FROM telemetry_points ${where}
         ORDER BY elapsed_seconds ASC
         LIMIT @limit`
      )
      .all(params);
    return rows.map((row) => TelemetryPointSchema.parse(JSON.parse(row.raw_json)));
  }

  getEvents(sessionId: string): RoastEvent[] {
    const rows = this.db
      .prepare(`SELECT raw_json FROM events WHERE session_id = @sessionId ORDER BY ts ASC`)
      .all({ sessionId });
    return rows.map((row) => RoastEventSchema.parse(JSON.parse(row.raw_json)));
  }
}
