import type { Database } from "better-sqlite3";
import {
  EventOverrideSchema,
  RoastEventSchema,
  RoastSessionSchema,
  RoastSessionSummarySchema,
  RoastReportSchema,
  SessionMetaSchema,
  SessionNoteSchema,
  TelemetryPointSchema,
  RoastProfileSchema,
  RoastProfileVersionSchema,
  RoastProfileExportBundleSchema,
  RoastProfileCsvRowSchema
} from "@sim-corp/schemas";
import type {
  EventOverride,
  RoastEvent,
  RoastSession,
  RoastSessionSummary,
  RoastReport,
  SessionMeta,
  SessionNote,
  TelemetryPoint,
  RoastProfile,
  RoastProfileVersion,
  RoastProfileExportBundle,
  RoastProfileCsvRow
} from "@sim-corp/schemas";

export const DEFAULT_REPORT_KIND = "POST_ROAST_V1";

export interface SessionReportResult {
  report: RoastReport;
  created: boolean;
}

export interface SessionFilters {
  orgId?: string;
  siteId?: string;
  machineId?: string;
  status?: "ACTIVE" | "CLOSED";
  limit?: number;
  offset?: number;
}

export interface ProfileFilters {
  orgId: string;
  siteId?: string;
  machineModel?: string;
  q?: string;
  tag?: string;
  includeArchived?: boolean;
  limit?: number;
}

export interface ProfileImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
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

  getTelemetryStats(sessionId: string): { count: number; hasBT: boolean; hasET: boolean; lastElapsedSeconds: number | null } {
    const row = this.db
      .prepare(
        `SELECT
           COUNT(*) as count,
           SUM(CASE WHEN bt_c IS NOT NULL THEN 1 ELSE 0 END) as bt_count,
           SUM(CASE WHEN et_c IS NOT NULL THEN 1 ELSE 0 END) as et_count,
           MAX(elapsed_seconds) as last_elapsed
         FROM telemetry_points
         WHERE session_id = @sessionId`
      )
      .get({ sessionId }) as { count?: number; bt_count?: number; et_count?: number; last_elapsed?: number | null } | undefined;

    if (!row) {
      return { count: 0, hasBT: false, hasET: false, lastElapsedSeconds: null };
    }

    return {
      count: Number(row.count ?? 0),
      hasBT: Number(row.bt_count ?? 0) > 0,
      hasET: Number(row.et_count ?? 0) > 0,
      lastElapsedSeconds: typeof row.last_elapsed === "number" ? row.last_elapsed : null
    };
  }

  createSessionReport(sessionId: string, report: RoastReport, traceId?: string): SessionReportResult {
    const baseId = report.reportId ?? this.generateReportId(sessionId);
    const createdAt = report.createdAt ?? new Date().toISOString();
    const reportKind = (report as RoastReport & { reportKind?: string }).reportKind ?? DEFAULT_REPORT_KIND;
    const parsed = RoastReportSchema.parse({
      ...report,
      reportId: baseId,
      sessionId,
      createdAt,
      reportKind
    });

    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO session_reports (report_id, session_id, report_kind, created_at, created_by, agent_name, agent_version, markdown, report_json, trace_id)
         VALUES (@reportId, @sessionId, @reportKind, @createdAt, @createdBy, @agentName, @agentVersion, @markdown, @reportJson, @traceId)`
      )
      .run({
        reportId: parsed.reportId,
        sessionId,
        reportKind: parsed.reportKind,
        createdAt: parsed.createdAt,
        createdBy: parsed.createdBy,
        agentName: parsed.agentName ?? null,
        agentVersion: parsed.agentVersion ?? null,
        markdown: parsed.markdown,
        reportJson: JSON.stringify(parsed),
        traceId: traceId ?? null
      });

    if (result.changes === 0) {
      const existing = this.getSessionReportByKind(sessionId, reportKind);
      if (!existing) {
        throw new Error("Failed to persist session report");
      }
      return { report: existing, created: false };
    }

    return { report: parsed, created: true };
  }

  listSessionReports(sessionId: string, limit = 20, offset = 0): RoastReport[] {
    const rows = this.db
      .prepare(
        `SELECT report_json FROM session_reports WHERE session_id = @sessionId ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
      )
      .all({ sessionId, limit, offset });

    return rows.map((row) => RoastReportSchema.parse(JSON.parse(row.report_json)));
  }

  getLatestSessionReport(sessionId: string, reportKind: string = DEFAULT_REPORT_KIND): RoastReport | null {
    const row = this.db
      .prepare(
        `SELECT report_json FROM session_reports WHERE session_id = @sessionId AND report_kind = @reportKind ORDER BY created_at DESC LIMIT 1`
      )
      .get({ sessionId, reportKind });
    if (!row) return null;
    return RoastReportSchema.parse(JSON.parse(row.report_json));
  }

  getSessionReportByKind(sessionId: string, reportKind: string = DEFAULT_REPORT_KIND): RoastReport | null {
    const row = this.db
      .prepare(
        `SELECT report_json FROM session_reports WHERE session_id = @sessionId AND report_kind = @reportKind LIMIT 1`
      )
      .get({ sessionId, reportKind });
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

  listProfiles(filters: ProfileFilters): RoastProfile[] {
    const conditions = ["org_id = @orgId"];
    const params: Record<string, unknown> = { orgId: filters.orgId };
    if (filters.siteId) {
      conditions.push("site_id = @siteId");
      params.siteId = filters.siteId;
    }
    if (filters.machineModel) {
      conditions.push("machine_model = @machineModel");
      params.machineModel = filters.machineModel;
    }
    if (filters.q) {
      conditions.push("(name LIKE @q OR notes LIKE @q)");
      params.q = `%${filters.q}%`;
    }
    if (!filters.includeArchived) {
      conditions.push("is_archived = 0");
    }
    if (filters.tag) {
      conditions.push("tags_json LIKE @tagFilter");
      params.tagFilter = `%"${filters.tag}"%`;
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const limit = typeof filters.limit === "number" ? filters.limit : 50;
    const rows = this.db
      .prepare(`SELECT profile_json FROM roast_profiles ${where} ORDER BY updated_at DESC LIMIT @limit`)
      .all({ ...params, limit });

    return rows.map((row) => RoastProfileSchema.parse(JSON.parse(row.profile_json)));
  }

  getProfile(orgId: string, profileId: string): RoastProfile | null {
    const row = this.db
      .prepare(`SELECT profile_json FROM roast_profiles WHERE org_id = @orgId AND profile_id = @profileId LIMIT 1`)
      .get({ orgId, profileId });
    if (!row) return null;
    return RoastProfileSchema.parse(JSON.parse(row.profile_json));
  }

  createProfile(profile: Partial<RoastProfile>, changeNote?: string): RoastProfile {
    const now = new Date().toISOString();
    const parsed = RoastProfileSchema.parse({
      ...profile,
      profileId: profile.profileId ?? generateProfileId(),
      version: profile.version && profile.version >= 1 ? profile.version : 1,
      createdAt: profile.createdAt ?? now,
      updatedAt: profile.updatedAt ?? now,
      isArchived: profile.isArchived ?? false,
      source: profile.source ?? { kind: "MANUAL" }
    });

    const tx = this.db.transaction(() => {
      this.persistProfile(parsed);
      this.insertVersion(parsed, changeNote);
    });
    tx();
    return parsed;
  }

  addProfileVersion(
    orgId: string,
    profileId: string,
    profile: Partial<RoastProfile>,
    changeNote?: string
  ): RoastProfile {
    const existing = this.getProfile(orgId, profileId);
    if (!existing) {
      throw new Error(`Profile ${profileId} not found for org ${orgId}`);
    }
    const now = new Date().toISOString();
    const merged: RoastProfile = {
      ...existing,
      ...profile,
      orgId,
      profileId,
      version: existing.version + 1,
      createdAt: existing.createdAt ?? now,
      updatedAt: now,
      source: profile.source ?? existing.source,
      isArchived: profile.isArchived ?? existing.isArchived ?? false
    };
    const parsed = RoastProfileSchema.parse(merged);

    const tx = this.db.transaction(() => {
      this.persistProfile(parsed);
      this.insertVersion(parsed, changeNote);
    });
    tx();
    return parsed;
  }

  setProfileArchived(orgId: string, profileId: string, isArchived: boolean): RoastProfile | null {
    const existing = this.getProfile(orgId, profileId);
    if (!existing) return null;
    const updated: RoastProfile = {
      ...existing,
      isArchived,
      updatedAt: new Date().toISOString()
    };
    this.persistProfile(updated);
    return updated;
  }

  listProfileVersions(orgId: string, profileId: string): RoastProfileVersion[] {
    const rows = this.db
      .prepare(
        `SELECT snapshot_json, change_note, created_at, version, created_by FROM roast_profile_versions
         WHERE org_id = @orgId AND profile_id = @profileId
         ORDER BY version DESC`
      )
      .all({ orgId, profileId });
    return rows.map((row) =>
      RoastProfileVersionSchema.parse({
        profileId,
        orgId,
        version: row.version,
        createdAt: row.created_at,
        createdBy: row.created_by ?? undefined,
        snapshot: JSON.parse(row.snapshot_json),
        changeNote: row.change_note ?? undefined
      })
    );
  }

  exportProfileBundle(orgId: string, profileId?: string): RoastProfileExportBundle {
    if (profileId) {
      const profile = this.getProfile(orgId, profileId);
      if (!profile) {
        return { profiles: [] };
      }
      return RoastProfileExportBundleSchema.parse({ profiles: [profile] });
    }
    return RoastProfileExportBundleSchema.parse({
      profiles: this.listProfiles({ orgId, includeArchived: true })
    });
  }

  importProfiles(orgId: string, bundle: RoastProfileExportBundle): ProfileImportSummary {
    const parsedBundle = RoastProfileExportBundleSchema.parse(bundle);
    const summary: ProfileImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };
    for (const profile of parsedBundle.profiles) {
      const now = new Date().toISOString();
      const candidate = RoastProfileSchema.parse({
        ...profile,
        orgId: profile.orgId ?? orgId,
        profileId: profile.profileId ?? generateProfileId(),
        createdAt: profile.createdAt ?? now,
        updatedAt: profile.updatedAt ?? now,
        version: profile.version ?? 1,
        source: profile.source ?? { kind: "IMPORT" },
        isArchived: profile.isArchived ?? false
      });
      try {
        const existing = this.getProfile(candidate.orgId, candidate.profileId);
        if (!existing) {
          this.createProfile(candidate, "Imported");
          summary.created += 1;
          continue;
        }
        if (profilesEqual(existing, candidate)) {
          summary.skipped += 1;
          continue;
        }
        this.addProfileVersion(candidate.orgId, candidate.profileId, candidate, "Imported new version");
        summary.updated += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(message);
      }
    }
    return summary;
  }

  importCsvProfiles(orgId: string, rows: RoastProfileCsvRow[]): ProfileImportSummary {
    const summary: ProfileImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };
    const now = new Date().toISOString();
    for (const row of rows) {
      const parsedRow = RoastProfileCsvRowSchema.parse(row);
      const targets: RoastProfile["targets"] = {
        chargeTempC: parsedRow.chargeTempC,
        turningPointTempC: parsedRow.turningPointTempC,
        firstCrackTempC: parsedRow.firstCrackTempC,
        dropTempC: parsedRow.dropTempC,
        targetDevRatio: parsedRow.targetDevRatio,
        targetTimeToFCSeconds: parsedRow.targetTimeToFCSeconds,
        targetDropSeconds: parsedRow.targetDropSeconds
      };
      const profile = RoastProfileSchema.parse({
        profileId: generateProfileId(),
        name: parsedRow.name,
        version: 1,
        createdAt: now,
        updatedAt: now,
        orgId,
        machineModel: parsedRow.machineModel,
        batchSizeGrams: parsedRow.batchSizeGrams,
        targets,
        tags: parsedRow.tags ? parsedRow.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
        notes: parsedRow.notes,
        source: { kind: "IMPORT" }
      });
      try {
        const existing = this.getProfile(profile.orgId, profile.profileId);
        if (!existing) {
          this.createProfile(profile, "Imported CSV");
          summary.created += 1;
          continue;
        }
        if (profilesEqual(existing, profile)) {
          summary.skipped += 1;
          continue;
        }
        this.addProfileVersion(profile.orgId, profile.profileId, profile, "Imported CSV");
        summary.updated += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(message);
      }
    }
    return summary;
  }

  private persistProfile(profile: RoastProfile): void {
    this.db
      .prepare(`
        INSERT INTO roast_profiles (
          profile_id, org_id, name, version, site_id, machine_model, batch_size_grams,
          targets_json, curve_json, tags_json, notes, source_json, is_archived, created_at, updated_at, profile_json
        ) VALUES (
          @profileId, @orgId, @name, @version, @siteId, @machineModel, @batchSizeGrams,
          @targetsJson, @curveJson, @tagsJson, @notes, @sourceJson, @isArchived, @createdAt, @updatedAt, @profileJson
        )
        ON CONFLICT(org_id, profile_id) DO UPDATE SET
          name=excluded.name,
          version=excluded.version,
          site_id=excluded.site_id,
          machine_model=excluded.machine_model,
          batch_size_grams=excluded.batch_size_grams,
          targets_json=excluded.targets_json,
          curve_json=excluded.curve_json,
          tags_json=excluded.tags_json,
          notes=excluded.notes,
          source_json=excluded.source_json,
          is_archived=excluded.is_archived,
          updated_at=excluded.updated_at,
          profile_json=excluded.profile_json
      `)
      .run({
        profileId: profile.profileId,
        orgId: profile.orgId,
        name: profile.name,
        version: profile.version,
        siteId: profile.siteId ?? null,
        machineModel: profile.machineModel ?? null,
        batchSizeGrams: profile.batchSizeGrams ?? null,
        targetsJson: JSON.stringify(profile.targets),
        curveJson: profile.curve ? JSON.stringify(profile.curve) : null,
        tagsJson: profile.tags ? JSON.stringify(profile.tags) : null,
        notes: profile.notes ?? null,
        sourceJson: JSON.stringify(profile.source),
        isArchived: profile.isArchived ? 1 : 0,
        createdAt: profile.createdAt,
        updatedAt: profile.updatedAt,
        profileJson: JSON.stringify(profile)
      });
  }

  private insertVersion(profile: RoastProfile, changeNote?: string): RoastProfileVersion {
    const record = RoastProfileVersionSchema.parse({
      profileId: profile.profileId,
      version: profile.version,
      createdAt: profile.updatedAt,
      snapshot: profile,
      changeNote
    });
    this.db
      .prepare(
        `INSERT OR REPLACE INTO roast_profile_versions (profile_id, org_id, version, created_at, created_by, change_note, snapshot_json)
         VALUES (@profileId, @orgId, @version, @createdAt, @createdBy, @changeNote, @snapshotJson)`
      )
      .run({
        profileId: profile.profileId,
        orgId: profile.orgId,
        version: record.version,
        createdAt: record.createdAt,
        createdBy: record.createdBy ?? null,
        changeNote: record.changeNote ?? null,
        snapshotJson: JSON.stringify(record.snapshot)
      });
    return record;
  }

  private generateReportId(sessionId: string): string {
    const ts = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15);
    const rand = Math.random().toString(36).slice(2, 8);
    return `R-${sessionId}-${ts}-${rand}`;
  }
}

function generateProfileId(): string {
  const ts = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 12);
  const rand = Math.random().toString(36).slice(2, 6);
  return `P-${ts}-${rand}`;
}

function canonicalizeProfile(profile: RoastProfile): Record<string, unknown> {
  const { version: _v, createdAt: _c, updatedAt: _u, ...rest } = profile;
  return {
    ...rest,
    tags: profile.tags ? [...profile.tags].sort() : undefined
  };
}

function profilesEqual(a: RoastProfile, b: RoastProfile): boolean {
  return JSON.stringify(canonicalizeProfile(a)) === JSON.stringify(canonicalizeProfile(b));
}
