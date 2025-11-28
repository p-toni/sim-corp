import type { Database } from "better-sqlite3";
import {
  EventOverrideSchema,
  RoastEventSchema,
  RoastSessionSchema,
  RoastSessionSummarySchema,
  RoastReportSchema,
  SessionMetaSchema,
  SessionNoteSchema,
  TelemetryPointSchema
} from "@sim-corp/schemas";
import type {
  EventOverride,
  RoastEvent,
  RoastSession,
  RoastSessionSummary,
  RoastReport,
  SessionMeta,
  SessionNote,
  TelemetryPoint
} from "@sim-corp/schemas";

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

  getSessionMeta(sessionId: string): SessionMeta | null {
    const row = this.db
      .prepare(`SELECT meta_json, updated_at FROM session_meta WHERE session_id = @sessionId`)
      .get({ sessionId });
    if (!row) return null;
    return SessionMetaSchema.parse(JSON.parse(row.meta_json));
  }

  upsertSessionMeta(sessionId: string, meta: SessionMeta): SessionMeta {
    const parsed = SessionMetaSchema.parse(meta);
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO session_meta (session_id, meta_json, updated_at)
         VALUES (@sessionId, @metaJson, @updatedAt)
         ON CONFLICT(session_id) DO UPDATE SET meta_json=excluded.meta_json, updated_at=excluded.updated_at`
      )
      .run({
        sessionId,
        metaJson: JSON.stringify(parsed),
        updatedAt: now
      });
    return parsed;
  }

  listSessionNotes(sessionId: string, limit = 50, offset = 0): SessionNote[] {
    const rows = this.db
      .prepare(
        `SELECT note_json FROM session_notes WHERE session_id = @sessionId ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
      )
      .all({ sessionId, limit, offset });
    return rows.map((row) => SessionNoteSchema.parse(JSON.parse(row.note_json)));
  }

  addSessionNote(
    sessionId: string,
    input: Omit<SessionNote, "noteId" | "createdAt">
  ): SessionNote {
    const now = new Date().toISOString();
    const noteId = `N-${sessionId}-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
    const note = SessionNoteSchema.parse({
      ...input,
      noteId,
      createdAt: now
    });
    this.db
      .prepare(
        `INSERT INTO session_notes (note_id, session_id, created_at, author, note_json)
         VALUES (@noteId, @sessionId, @createdAt, @author, @noteJson)`
      )
      .run({
        noteId,
        sessionId,
        createdAt: note.createdAt,
        author: note.author ?? null,
        noteJson: JSON.stringify(note)
      });
    return note;
  }

  getEventOverrides(sessionId: string): EventOverride[] {
    const rows = this.db
      .prepare(
        `SELECT event_type, elapsed_seconds, source, author, reason, updated_at FROM event_overrides WHERE session_id = @sessionId`
      )
      .all({ sessionId });
    return rows.map((row) =>
      EventOverrideSchema.parse({
        eventType: row.event_type,
        elapsedSeconds: row.elapsed_seconds,
        source: row.source,
        author: row.author ?? undefined,
        reason: row.reason ?? undefined,
        updatedAt: row.updated_at
      })
    );
  }

  upsertEventOverrides(sessionId: string, overrides: EventOverride[]): EventOverride[] {
    const parsedOverrides = overrides.map((o) =>
      EventOverrideSchema.parse({
        ...o,
        updatedAt: o.updatedAt ?? new Date().toISOString()
      })
    );
    const stmt = this.db.prepare(
      `INSERT INTO event_overrides (session_id, event_type, elapsed_seconds, source, author, reason, updated_at)
       VALUES (@sessionId, @eventType, @elapsedSeconds, @source, @author, @reason, @updatedAt)
       ON CONFLICT(session_id, event_type) DO UPDATE SET
         elapsed_seconds=excluded.elapsed_seconds,
         source=excluded.source,
         author=excluded.author,
         reason=excluded.reason,
         updated_at=excluded.updated_at`
    );
    const now = new Date().toISOString();
    for (const override of parsedOverrides) {
      stmt.run({
        sessionId,
        eventType: override.eventType,
        elapsedSeconds: override.elapsedSeconds,
        source: override.source ?? "HUMAN",
        author: override.author ?? null,
        reason: override.reason ?? null,
        updatedAt: override.updatedAt ?? now
      });
    }
    return this.getEventOverrides(sessionId);
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

  getLastTelemetryElapsed(sessionId: string): number | null {
    const row = this.db
      .prepare(
        `SELECT elapsed_seconds FROM telemetry_points WHERE session_id = @sessionId ORDER BY elapsed_seconds DESC LIMIT 1`
      )
      .get({ sessionId });
    if (!row) return null;
    const value = Number(row.elapsed_seconds);
    return Number.isFinite(value) ? value : null;
  }

  createSessionReport(sessionId: string, report: RoastReport, traceId?: string): RoastReport {
    const baseId = report.reportId ?? this.generateReportId(sessionId);
    const createdAt = report.createdAt ?? new Date().toISOString();
    const parsed = RoastReportSchema.parse({
      ...report,
      reportId: baseId,
      sessionId,
      createdAt
    });

    this.db
      .prepare(
        `INSERT INTO session_reports (report_id, session_id, created_at, created_by, agent_name, agent_version, markdown, report_json, trace_id)
         VALUES (@reportId, @sessionId, @createdAt, @createdBy, @agentName, @agentVersion, @markdown, @reportJson, @traceId)`
      )
      .run({
        reportId: parsed.reportId,
        sessionId,
        createdAt: parsed.createdAt,
        createdBy: parsed.createdBy,
        agentName: parsed.agentName ?? null,
        agentVersion: parsed.agentVersion ?? null,
        markdown: parsed.markdown,
        reportJson: JSON.stringify(parsed),
        traceId: traceId ?? null
      });

    return parsed;
  }

  listSessionReports(sessionId: string, limit = 20, offset = 0): RoastReport[] {
    const rows = this.db
      .prepare(
        `SELECT report_json FROM session_reports WHERE session_id = @sessionId ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
      )
      .all({ sessionId, limit, offset });

    return rows.map((row) => RoastReportSchema.parse(JSON.parse(row.report_json)));
  }

  getLatestSessionReport(sessionId: string): RoastReport | null {
    const row = this.db
      .prepare(
        `SELECT report_json FROM session_reports WHERE session_id = @sessionId ORDER BY created_at DESC LIMIT 1`
      )
      .get({ sessionId });
    if (!row) return null;
    return RoastReportSchema.parse(JSON.parse(row.report_json));
  }

  getSessionReportById(reportId: string): RoastReport | null {
    const row = this.db
      .prepare(`SELECT report_json FROM session_reports WHERE report_id = @reportId LIMIT 1`)
      .get({ reportId });
    if (!row) return null;
    return RoastReportSchema.parse(JSON.parse(row.report_json));
  }

  private generateReportId(sessionId: string): string {
    const ts = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15);
    const rand = Math.random().toString(36).slice(2, 8);
    return `R-${sessionId}-${ts}-${rand}`;
  }
}
