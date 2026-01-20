import { createDatabase, type Database, type DatabaseFactoryConfig } from '@sim-corp/database';
import { join } from 'node:path';
import type { FastifyBaseLogger } from 'fastify';

let dbInstance: Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NULL,
  status TEXT NOT NULL,
  duration_seconds INTEGER NULL,
  fc_seconds INTEGER NULL,
  drop_seconds INTEGER NULL,
  max_bt_c REAL NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_org_site_machine_started
  ON sessions (org_id, site_id, machine_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_status_org_site_machine
  ON sessions (status, org_id, site_id, machine_id);

CREATE TABLE IF NOT EXISTS telemetry_points (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  elapsed_seconds REAL NOT NULL,
  bt_c REAL,
  et_c REAL,
  ror_c_per_min REAL,
  ambient_c REAL,
  raw_json TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tp_session_elapsed ON telemetry_points (session_id, elapsed_seconds);
CREATE INDEX IF NOT EXISTS idx_tp_session_ts ON telemetry_points (session_id, ts);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  ts TEXT NOT NULL,
  elapsed_seconds REAL NULL,
  type TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events (session_id, ts);
CREATE INDEX IF NOT EXISTS idx_events_session_type ON events (session_id, type);

CREATE TABLE IF NOT EXISTS session_meta (
  session_id TEXT PRIMARY KEY,
  meta_json TEXT NOT NULL,
  actor_json TEXT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS session_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  author TEXT NULL,
  actor_json TEXT NULL,
  note_json TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_notes_session_created ON session_notes (session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS event_overrides (
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  elapsed_seconds REAL NOT NULL,
  source TEXT NOT NULL,
  author TEXT NULL,
  actor_json TEXT NULL,
  reason TEXT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (session_id, event_type),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_overrides_session ON event_overrides (session_id);

CREATE TABLE IF NOT EXISTS session_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  report_kind TEXT NOT NULL DEFAULT 'POST_ROAST_V1',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  actor_json TEXT NULL,
  agent_name TEXT NULL,
  agent_version TEXT NULL,
  markdown TEXT NOT NULL,
  report_json TEXT NOT NULL,
  trace_id TEXT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_session_reports_session_created ON session_reports (session_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_session_reports_session_kind ON session_reports (session_id, report_kind);
CREATE INDEX IF NOT EXISTS idx_session_reports_report_id ON session_reports (report_id);

CREATE TABLE IF NOT EXISTS roast_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  site_id TEXT NULL,
  machine_model TEXT NULL,
  batch_size_grams REAL NULL,
  targets_json TEXT NOT NULL,
  curve_json TEXT NULL,
  tags_json TEXT NULL,
  notes TEXT NULL,
  source_json TEXT NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  actor_json TEXT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  UNIQUE(org_id, profile_id)
);

CREATE INDEX IF NOT EXISTS idx_roast_profiles_org_name ON roast_profiles (org_id, name);
CREATE INDEX IF NOT EXISTS idx_roast_profiles_org_site ON roast_profiles (org_id, site_id);
CREATE INDEX IF NOT EXISTS idx_roast_profiles_org_machine ON roast_profiles (org_id, machine_model);

CREATE TABLE IF NOT EXISTS roast_profile_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NULL,
  actor_json TEXT NULL,
  change_note TEXT NULL,
  snapshot_json TEXT NOT NULL,
  UNIQUE(org_id, profile_id, version)
);
`;

export async function getDatabase(
  dbPath?: string,
  logger?: FastifyBaseLogger
): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const resolvedPath = dbPath ?? process.env.INGESTION_DB_PATH ?? join(process.cwd(), 'var', 'ingestion.db');
  const type = (process.env.DATABASE_TYPE as 'sqlite' | 'postgres') || 'sqlite';

  const config: DatabaseFactoryConfig = {
    type,
    schema: SCHEMA,
    logger: {
      info: (msg, meta) => {
        const message = `[Ingestion DB] ${msg}`;
        if (logger) {
          logger.info(meta || {}, message);
        } else {
          console.log(message, meta || '');
        }
      },
      error: (msg, meta) => {
        const message = `[Ingestion DB] ${msg}`;
        if (logger) {
          logger.error(meta || {}, message);
        } else {
          console.error(message, meta || '');
        }
      },
      warn: (msg, meta) => {
        const message = `[Ingestion DB] ${msg}`;
        if (logger) {
          logger.warn(meta || {}, message);
        } else {
          console.warn(message, meta || '');
        }
      },
    },
  };

  if (type === 'sqlite') {
    config.path = resolvedPath;
  } else if (type === 'postgres') {
    config.host = process.env.POSTGRES_HOST;
    config.port = process.env.POSTGRES_PORT ? parseInt(process.env.POSTGRES_PORT, 10) : 5432;
    config.database = process.env.POSTGRES_DB || 'simcorp';
    config.user = process.env.POSTGRES_USER;
    config.password = process.env.POSTGRES_PASSWORD;
    config.poolMin = process.env.DATABASE_POOL_MIN ? parseInt(process.env.DATABASE_POOL_MIN, 10) : 2;
    config.poolMax = process.env.DATABASE_POOL_MAX ? parseInt(process.env.DATABASE_POOL_MAX, 10) : 10;
  }

  dbInstance = await createDatabase(config);

  if (logger) {
    logger.info({ dbType: dbInstance.type }, 'Ingestion database initialized');
  } else {
    console.log(`[Ingestion] Database initialized (${dbInstance.type})`);
  }

  // Apply migrations after database is initialized
  await applyMigrations(dbInstance, logger);

  return dbInstance;
}

// Migration function to add report_kind column and related fixes
async function applyMigrations(db: Database, logger?: FastifyBaseLogger): Promise<void> {
  await migrateSessionReports(db, logger);
}

async function migrateSessionReports(db: Database, logger?: FastifyBaseLogger): Promise<void> {
  // Check if report_kind column exists
  const result = await db.query(`PRAGMA table_info(session_reports)`, []);
  const columns = result.rows as Array<{ name: string }>;
  const hasReportKind = columns.some((col) => col.name === "report_kind");

  if (!hasReportKind) {
    if (logger) {
      logger.info('Adding report_kind column to session_reports');
    } else {
      console.log('[Ingestion] Adding report_kind column to session_reports');
    }
    await db.exec(`ALTER TABLE session_reports ADD COLUMN report_kind TEXT NOT NULL DEFAULT 'POST_ROAST_V1';`, []);
  }

  // Update any null or empty report_kind values
  await db.exec(
    `UPDATE session_reports SET report_kind = 'POST_ROAST_V1' WHERE report_kind IS NULL OR report_kind = ''`,
    []
  );

  // Backfill reportKind in report_json
  await backfillReportJson(db, logger);

  // Remove duplicates
  await dedupeReports(db, logger);

  // Create unique index
  await db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_session_reports_session_kind ON session_reports (session_id, report_kind)`,
    []
  );
}

async function backfillReportJson(db: Database, logger?: FastifyBaseLogger): Promise<void> {
  const result = await db.query(
    `SELECT id, report_json FROM session_reports WHERE json_extract(report_json, '$.reportKind') IS NULL`,
    []
  );
  const missingKind = result.rows as Array<{ id: number; report_json: string }>;

  if (!missingKind.length) return;

  if (logger) {
    logger.info({ count: missingKind.length }, 'Backfilling reportKind in report_json');
  } else {
    console.log(`[Ingestion] Backfilling reportKind in report_json (${missingKind.length} rows)`);
  }

  for (const row of missingKind) {
    try {
      const parsed = JSON.parse(row.report_json) as Record<string, unknown>;
      const updated = JSON.stringify({ ...parsed, reportKind: "POST_ROAST_V1" });
      await db.exec(`UPDATE session_reports SET report_json = ? WHERE id = ?`, [updated, row.id]);
    } catch {
      // Leave invalid JSON as-is; parsing will fail later.
    }
  }
}

async function dedupeReports(db: Database, logger?: FastifyBaseLogger): Promise<void> {
  const result = await db.query(
    `SELECT id FROM (
      SELECT id,
             ROW_NUMBER() OVER (PARTITION BY session_id, report_kind ORDER BY created_at DESC, id DESC) AS rn
      FROM session_reports
    )
    WHERE rn > 1`,
    []
  );
  const duplicates = result.rows as Array<{ id: number }>;

  if (!duplicates.length) return;

  if (logger) {
    logger.warn({ count: duplicates.length }, 'Removing duplicate session reports');
  } else {
    console.warn(`[Ingestion] Removing duplicate session reports (${duplicates.length} rows)`);
  }

  for (const row of duplicates) {
    await db.exec(`DELETE FROM session_reports WHERE id = ?`, [row.id]);
  }
}
