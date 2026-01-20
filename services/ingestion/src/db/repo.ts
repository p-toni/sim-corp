import type { Database } from "@sim-corp/database";
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
  RoastProfileCsvRowSchema,
  ActorSchema
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
  RoastProfileCsvRow,
  Actor
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

  async upsertSession(session: RoastSessionSummary): Promise<void> {
    const parsed = RoastSessionSummarySchema.parse(session);
    const now = new Date().toISOString();
    await this.db.exec(
      `INSERT INTO sessions (session_id, org_id, site_id, machine_id, started_at, ended_at, status, duration_seconds, fc_seconds, drop_seconds, max_bt_c, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET
         ended_at=excluded.ended_at,
         status=excluded.status,
         duration_seconds=excluded.duration_seconds,
         fc_seconds=excluded.fc_seconds,
         drop_seconds=excluded.drop_seconds,
         max_bt_c=excluded.max_bt_c`,
      [
        parsed.sessionId,
        parsed.orgId,
        parsed.siteId,
        parsed.machineId,
        parsed.startedAt,
        parsed.endedAt,
        parsed.status,
        parsed.durationSeconds ?? null,
        parsed.fcSeconds ?? null,
        parsed.dropSeconds ?? null,
        parsed.maxBtC ?? null,
        now
      ]
    );
  }

  async getSessionMeta(sessionId: string): Promise<SessionMeta | null> {
    const result = await this.db.query(
      `SELECT meta_json, updated_at FROM session_meta WHERE session_id = ?`,
      [sessionId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as { meta_json: string };
    return SessionMetaSchema.parse(JSON.parse(row.meta_json));
  }

  async upsertSessionMeta(sessionId: string, meta: SessionMeta, actor?: Actor): Promise<SessionMeta> {
    const parsed = SessionMetaSchema.parse(meta);
    const now = new Date().toISOString();
    await this.db.exec(
      `INSERT INTO session_meta (session_id, meta_json, actor_json, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(session_id) DO UPDATE SET meta_json=excluded.meta_json, actor_json=excluded.actor_json, updated_at=excluded.updated_at`,
      [sessionId, JSON.stringify(parsed), actorToJson(actor), now]
    );
    return parsed;
  }

  async listSessionNotes(sessionId: string, limit = 50, offset = 0): Promise<SessionNote[]> {
    const result = await this.db.query(
      `SELECT note_json FROM session_notes WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [sessionId, limit, offset]
    );
    return result.rows.map((row: any) => SessionNoteSchema.parse(JSON.parse(row.note_json)));
  }

  async addSessionNote(
    sessionId: string,
    input: Omit<SessionNote, "noteId" | "createdAt">,
    actor?: Actor
  ): Promise<SessionNote> {
    const now = new Date().toISOString();
    const noteId = `N-${sessionId}-${Math.random().toString(36).slice(2, 8)}-${Date.now()}`;
    const note = SessionNoteSchema.parse({
      ...input,
      actor: input.actor ?? actor,
      noteId,
      createdAt: now
    });
    await this.db.exec(
      `INSERT INTO session_notes (note_id, session_id, created_at, author, actor_json, note_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [noteId, sessionId, note.createdAt, note.author ?? null, actorToJson(note.actor ?? actor), JSON.stringify(note)]
    );
    return note;
  }

  async getEventOverrides(sessionId: string): Promise<EventOverride[]> {
    const result = await this.db.query(
      `SELECT event_type, elapsed_seconds, source, author, actor_json, reason, updated_at FROM event_overrides WHERE session_id = ?`,
      [sessionId]
    );
    return result.rows.map((row: any) =>
      EventOverrideSchema.parse({
        eventType: row.event_type,
        elapsedSeconds: row.elapsed_seconds,
        source: row.source,
        author: row.author ?? undefined,
        actor: parseActorJson(row.actor_json),
        reason: row.reason ?? undefined,
        updatedAt: row.updated_at
      })
    );
  }

  async upsertEventOverrides(sessionId: string, overrides: EventOverride[], actor?: Actor): Promise<EventOverride[]> {
    const parsedOverrides = overrides.map((o) =>
      EventOverrideSchema.parse({
        ...o,
        actor: o.actor ?? actor,
        updatedAt: o.updatedAt ?? new Date().toISOString()
      })
    );
    const now = new Date().toISOString();
    for (const override of parsedOverrides) {
      await this.db.exec(
        `INSERT INTO event_overrides (session_id, event_type, elapsed_seconds, source, author, actor_json, reason, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(session_id, event_type) DO UPDATE SET
           elapsed_seconds=excluded.elapsed_seconds,
           source=excluded.source,
           author=excluded.author,
           actor_json=excluded.actor_json,
           reason=excluded.reason,
           updated_at=excluded.updated_at`,
        [
          sessionId,
          override.eventType,
          override.elapsedSeconds,
          override.source ?? "HUMAN",
          override.author ?? null,
          actorToJson(override.actor ?? actor),
          override.reason ?? null,
          override.updatedAt ?? now
        ]
      );
    }
    return await this.getEventOverrides(sessionId);
  }

  async appendTelemetry(sessionId: string, point: TelemetryPoint): Promise<void> {
    const parsed = TelemetryPointSchema.parse(point);
    await this.db.exec(
      `INSERT INTO telemetry_points (session_id, ts, elapsed_seconds, bt_c, et_c, ror_c_per_min, ambient_c, raw_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        parsed.ts,
        parsed.elapsedSeconds,
        parsed.btC ?? null,
        parsed.etC ?? null,
        parsed.rorCPerMin ?? null,
        parsed.ambientC ?? null,
        JSON.stringify(parsed)
      ]
    );
  }

  async appendEvent(sessionId: string, event: RoastEvent): Promise<void> {
    const parsed = RoastEventSchema.parse(event);
    await this.db.exec(
      `INSERT INTO events (session_id, ts, elapsed_seconds, type, raw_json)
       VALUES (?, ?, ?, ?, ?)`,
      [
        sessionId,
        parsed.ts,
        parsed.payload?.elapsedSeconds ?? null,
        parsed.type,
        JSON.stringify(parsed)
      ]
    );
  }

  async listSessions(filters: SessionFilters = {}): Promise<RoastSessionSummary[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.orgId) {
      conditions.push("org_id = ?");
      params.push(filters.orgId);
    }
    if (filters.siteId) {
      conditions.push("site_id = ?");
      params.push(filters.siteId);
    }
    if (filters.machineId) {
      conditions.push("machine_id = ?");
      params.push(filters.machineId);
    }
    if (filters.status) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = typeof filters.limit === "number" ? filters.limit : 50;
    const offset = typeof filters.offset === "number" ? filters.offset : 0;

    const result = await this.db.query(
      `SELECT session_id, org_id, site_id, machine_id, started_at, ended_at, status, duration_seconds, fc_seconds, drop_seconds, max_bt_c
       FROM sessions ${where}
       ORDER BY started_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return result.rows.map((row: any) =>
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

  async getSession(sessionId: string): Promise<RoastSession | null> {
    const result = await this.db.query(
      `SELECT session_id, org_id, site_id, machine_id, started_at, ended_at, status, duration_seconds, fc_seconds, drop_seconds, max_bt_c
       FROM sessions WHERE session_id = ?`,
      [sessionId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as any;
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

  async getTelemetry(sessionId: string, limit = 2000, from?: number, to?: number): Promise<TelemetryPoint[]> {
    const conditions = ["session_id = ?"];
    const params: unknown[] = [sessionId];
    if (typeof from === "number") {
      conditions.push("elapsed_seconds >= ?");
      params.push(from);
    }
    if (typeof to === "number") {
      conditions.push("elapsed_seconds <= ?");
      params.push(to);
    }
    const where = `WHERE ${conditions.join(" AND ")}`;
    const result = await this.db.query(
      `SELECT raw_json FROM telemetry_points ${where}
       ORDER BY elapsed_seconds ASC
       LIMIT ?`,
      [...params, limit]
    );
    return result.rows.map((row: any) => TelemetryPointSchema.parse(JSON.parse(row.raw_json)));
  }

  async getEvents(sessionId: string): Promise<RoastEvent[]> {
    const result = await this.db.query(
      `SELECT raw_json FROM events WHERE session_id = ? ORDER BY ts ASC`,
      [sessionId]
    );
    return result.rows.map((row: any) => RoastEventSchema.parse(JSON.parse(row.raw_json)));
  }

  async getLastTelemetryElapsed(sessionId: string): Promise<number | null> {
    const result = await this.db.query(
      `SELECT elapsed_seconds FROM telemetry_points WHERE session_id = ? ORDER BY elapsed_seconds DESC LIMIT 1`,
      [sessionId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as any;
    const value = Number(row.elapsed_seconds);
    return Number.isFinite(value) ? value : null;
  }

  async getTelemetryStats(sessionId: string): Promise<{ count: number; hasBT: boolean; hasET: boolean; lastElapsedSeconds: number | null }> {
    const result = await this.db.query(
      `SELECT
         COUNT(*) as count,
         SUM(CASE WHEN bt_c IS NOT NULL THEN 1 ELSE 0 END) as bt_count,
         SUM(CASE WHEN et_c IS NOT NULL THEN 1 ELSE 0 END) as et_count,
         MAX(elapsed_seconds) as last_elapsed
       FROM telemetry_points
       WHERE session_id = ?`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return { count: 0, hasBT: false, hasET: false, lastElapsedSeconds: null };
    }

    const row = result.rows[0] as { count?: number; bt_count?: number; et_count?: number; last_elapsed?: number | null };

    return {
      count: Number(row.count ?? 0),
      hasBT: Number(row.bt_count ?? 0) > 0,
      hasET: Number(row.et_count ?? 0) > 0,
      lastElapsedSeconds: typeof row.last_elapsed === "number" ? row.last_elapsed : null
    };
  }

  async createSessionReport(
    sessionId: string,
    report: RoastReport,
    traceId?: string,
    actor?: Actor
  ): Promise<SessionReportResult> {
    const baseId = report.reportId ?? this.generateReportId(sessionId);
    const createdAt = report.createdAt ?? new Date().toISOString();
    const reportKind = (report as RoastReport & { reportKind?: string }).reportKind ?? DEFAULT_REPORT_KIND;
    const parsed = RoastReportSchema.parse({
      ...report,
      actor: report.actor ?? actor,
      reportId: baseId,
      sessionId,
      createdAt,
      reportKind
    });

    // Check if report already exists
    const existingCheck = await this.db.query(
      `SELECT report_id FROM session_reports WHERE session_id = ? AND report_kind = ?`,
      [sessionId, reportKind]
    );

    if (existingCheck.rows.length > 0) {
      const existing = await this.getSessionReportByKind(sessionId, reportKind);
      if (!existing) {
        throw new Error("Failed to persist session report");
      }
      return { report: existing, created: false };
    }

    await this.db.exec(
      `INSERT INTO session_reports (report_id, session_id, report_kind, created_at, created_by, actor_json, agent_name, agent_version, markdown, report_json, trace_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        parsed.reportId,
        sessionId,
        parsed.reportKind,
        parsed.createdAt,
        parsed.createdBy,
        actorToJson(parsed.actor ?? actor),
        parsed.agentName ?? null,
        parsed.agentVersion ?? null,
        parsed.markdown,
        JSON.stringify(parsed),
        traceId ?? null
      ]
    );

    return { report: parsed, created: true };
  }

  async listSessionReports(sessionId: string, limit = 20, offset = 0): Promise<RoastReport[]> {
    const result = await this.db.query(
      `SELECT report_json FROM session_reports WHERE session_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [sessionId, limit, offset]
    );

    return result.rows.map((row: any) => RoastReportSchema.parse(JSON.parse(row.report_json)));
  }

  async getLatestSessionReport(sessionId: string, reportKind: string = DEFAULT_REPORT_KIND): Promise<RoastReport | null> {
    const result = await this.db.query(
      `SELECT report_json FROM session_reports WHERE session_id = ? AND report_kind = ? ORDER BY created_at DESC LIMIT 1`,
      [sessionId, reportKind]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as any;
    return RoastReportSchema.parse(JSON.parse(row.report_json));
  }

  async getSessionReportByKind(sessionId: string, reportKind: string = DEFAULT_REPORT_KIND): Promise<RoastReport | null> {
    const result = await this.db.query(
      `SELECT report_json FROM session_reports WHERE session_id = ? AND report_kind = ? LIMIT 1`,
      [sessionId, reportKind]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as any;
    return RoastReportSchema.parse(JSON.parse(row.report_json));
  }

  async getSessionReportById(reportId: string): Promise<RoastReport | null> {
    const result = await this.db.query(
      `SELECT report_json FROM session_reports WHERE report_id = ? LIMIT 1`,
      [reportId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as any;
    return RoastReportSchema.parse(JSON.parse(row.report_json));
  }

  async listProfiles(filters: ProfileFilters): Promise<RoastProfile[]> {
    const conditions = ["org_id = ?"];
    const params: unknown[] = [filters.orgId];
    if (filters.siteId) {
      conditions.push("site_id = ?");
      params.push(filters.siteId);
    }
    if (filters.machineModel) {
      conditions.push("machine_model = ?");
      params.push(filters.machineModel);
    }
    if (filters.q) {
      conditions.push("(name LIKE ? OR notes LIKE ?)");
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    if (!filters.includeArchived) {
      conditions.push("is_archived = 0");
    }
    if (filters.tag) {
      conditions.push("tags_json LIKE ?");
      params.push(`%"${filters.tag}"%`);
    }

    const where = `WHERE ${conditions.join(" AND ")}`;
    const limit = typeof filters.limit === "number" ? filters.limit : 50;
    const result = await this.db.query(
      `SELECT profile_json FROM roast_profiles ${where} ORDER BY updated_at DESC LIMIT ?`,
      [...params, limit]
    );

    return result.rows.map((row: any) => RoastProfileSchema.parse(JSON.parse(row.profile_json)));
  }

  async getProfile(orgId: string, profileId: string): Promise<RoastProfile | null> {
    const result = await this.db.query(
      `SELECT profile_json FROM roast_profiles WHERE org_id = ? AND profile_id = ? LIMIT 1`,
      [orgId, profileId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as any;
    return RoastProfileSchema.parse(JSON.parse(row.profile_json));
  }

  async createProfile(profile: Partial<RoastProfile>, changeNote?: string, actor?: Actor): Promise<RoastProfile> {
    const now = new Date().toISOString();
    const parsed = RoastProfileSchema.parse({
      ...profile,
      actor: profile.actor ?? actor,
      profileId: profile.profileId ?? generateProfileId(),
      version: profile.version && profile.version >= 1 ? profile.version : 1,
      createdAt: profile.createdAt ?? now,
      updatedAt: profile.updatedAt ?? now,
      isArchived: profile.isArchived ?? false,
      source: profile.source ?? { kind: "MANUAL" }
    });

    // Execute as a transaction by doing operations sequentially
    await this.persistProfile(parsed, actor);
    await this.insertVersion(parsed, changeNote, actor);

    return parsed;
  }

  async addProfileVersion(
    orgId: string,
    profileId: string,
    profile: Partial<RoastProfile>,
    changeNote?: string,
    actor?: Actor
  ): Promise<RoastProfile> {
    const existing = await this.getProfile(orgId, profileId);
    if (!existing) {
      throw new Error(`Profile ${profileId} not found for org ${orgId}`);
    }
    const now = new Date().toISOString();
    const merged: RoastProfile = {
      ...existing,
      ...profile,
      actor: profile.actor ?? actor,
      orgId,
      profileId,
      version: existing.version + 1,
      createdAt: existing.createdAt ?? now,
      updatedAt: now,
      source: profile.source ?? existing.source,
      isArchived: profile.isArchived ?? existing.isArchived ?? false
    };
    const parsed = RoastProfileSchema.parse(merged);

    // Execute as a transaction by doing operations sequentially
    await this.persistProfile(parsed, actor);
    await this.insertVersion(parsed, changeNote, actor);

    return parsed;
  }

  async setProfileArchived(orgId: string, profileId: string, isArchived: boolean, actor?: Actor): Promise<RoastProfile | null> {
    const existing = await this.getProfile(orgId, profileId);
    if (!existing) return null;
    const updated: RoastProfile = {
      ...existing,
      isArchived,
      actor: actor ?? existing.actor,
      updatedAt: new Date().toISOString()
    };
    await this.persistProfile(updated, actor);
    return updated;
  }

  async listProfileVersions(orgId: string, profileId: string): Promise<RoastProfileVersion[]> {
    const result = await this.db.query(
      `SELECT snapshot_json, change_note, created_at, version, created_by, actor_json FROM roast_profile_versions
       WHERE org_id = ? AND profile_id = ?
       ORDER BY version DESC`,
      [orgId, profileId]
    );
    return result.rows.map((row: any) =>
      RoastProfileVersionSchema.parse({
        profileId,
        orgId,
        version: row.version,
        createdAt: row.created_at,
        createdBy: row.created_by ?? undefined,
        actor: parseActorJson(row.actor_json),
        snapshot: JSON.parse(row.snapshot_json),
        changeNote: row.change_note ?? undefined
      })
    );
  }

  async exportProfileBundle(orgId: string, profileId?: string): Promise<RoastProfileExportBundle> {
    if (profileId) {
      const profile = await this.getProfile(orgId, profileId);
      if (!profile) {
        return { profiles: [] };
      }
      return RoastProfileExportBundleSchema.parse({ profiles: [profile] });
    }
    const profiles = await this.listProfiles({ orgId, includeArchived: true });
    return RoastProfileExportBundleSchema.parse({ profiles });
  }

  async importProfiles(orgId: string, bundle: RoastProfileExportBundle, actor?: Actor): Promise<ProfileImportSummary> {
    const parsedBundle = RoastProfileExportBundleSchema.parse(bundle);
    const summary: ProfileImportSummary = { created: 0, updated: 0, skipped: 0, errors: [] };
    for (const profile of parsedBundle.profiles) {
      const now = new Date().toISOString();
      const candidate = RoastProfileSchema.parse({
        ...profile,
        actor: profile.actor ?? actor,
        orgId: profile.orgId ?? orgId,
        profileId: profile.profileId ?? generateProfileId(),
        createdAt: profile.createdAt ?? now,
        updatedAt: profile.updatedAt ?? now,
        version: profile.version ?? 1,
        source: profile.source ?? { kind: "IMPORT" },
        isArchived: profile.isArchived ?? false
      });
      try {
        const existing = await this.getProfile(candidate.orgId, candidate.profileId);
        if (!existing) {
          await this.createProfile(candidate, "Imported", actor);
          summary.created += 1;
          continue;
        }
        if (profilesEqual(existing, candidate)) {
          summary.skipped += 1;
          continue;
        }
        await this.addProfileVersion(candidate.orgId, candidate.profileId, candidate, "Imported new version", actor);
        summary.updated += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(message);
      }
    }
    return summary;
  }

  async importCsvProfiles(orgId: string, rows: RoastProfileCsvRow[], actor?: Actor): Promise<ProfileImportSummary> {
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
        source: { kind: "IMPORT" },
        actor
      });
      try {
        const existing = await this.getProfile(profile.orgId, profile.profileId);
        if (!existing) {
          await this.createProfile(profile, "Imported CSV", actor);
          summary.created += 1;
          continue;
        }
        if (profilesEqual(existing, profile)) {
          summary.skipped += 1;
          continue;
        }
        await this.addProfileVersion(profile.orgId, profile.profileId, profile, "Imported CSV", actor);
        summary.updated += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        summary.errors.push(message);
      }
    }
    return summary;
  }

  private async persistProfile(profile: RoastProfile, actor?: Actor): Promise<void> {
    await this.db.exec(
      `INSERT INTO roast_profiles (
        profile_id, org_id, name, version, site_id, machine_model, batch_size_grams,
        targets_json, curve_json, tags_json, notes, source_json, is_archived, actor_json, created_at, updated_at, profile_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        actor_json=excluded.actor_json,
        updated_at=excluded.updated_at,
        profile_json=excluded.profile_json`,
      [
        profile.profileId,
        profile.orgId,
        profile.name,
        profile.version,
        profile.siteId ?? null,
        profile.machineModel ?? null,
        profile.batchSizeGrams ?? null,
        JSON.stringify(profile.targets),
        profile.curve ? JSON.stringify(profile.curve) : null,
        profile.tags ? JSON.stringify(profile.tags) : null,
        profile.notes ?? null,
        JSON.stringify(profile.source),
        profile.isArchived ? 1 : 0,
        actorToJson(profile.actor ?? actor),
        profile.createdAt,
        profile.updatedAt,
        JSON.stringify(profile)
      ]
    );
  }

  private async insertVersion(profile: RoastProfile, changeNote?: string, actor?: Actor): Promise<RoastProfileVersion> {
    const record = RoastProfileVersionSchema.parse({
      profileId: profile.profileId,
      version: profile.version,
      createdAt: profile.updatedAt,
      snapshot: profile,
      actor: profile.actor ?? actor,
      changeNote
    });
    await this.db.exec(
      `INSERT OR REPLACE INTO roast_profile_versions (profile_id, org_id, version, created_at, created_by, actor_json, change_note, snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profile.profileId,
        profile.orgId,
        record.version,
        record.createdAt,
        record.createdBy ?? null,
        actorToJson(record.actor ?? actor),
        record.changeNote ?? null,
        JSON.stringify(record.snapshot)
      ]
    );
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

function actorToJson(actor?: Actor): string | null {
  if (!actor) return null;
  return JSON.stringify(actor);
}

function parseActorJson(value: unknown): Actor | undefined {
  if (!value) return undefined;
  try {
    return ActorSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
  } catch {
    return undefined;
  }
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
