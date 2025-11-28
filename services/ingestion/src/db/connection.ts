import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyBaseLogger } from "fastify";
import Database from "better-sqlite3";

const DEFAULT_DB_PATH = "./var/ingestion.db";

export function openDatabase(
  dbPath: string = process.env.INGESTION_DB_PATH ?? DEFAULT_DB_PATH,
  logger?: FastifyBaseLogger
): Database.Database {
  const resolvedPath = path.resolve(dbPath);
  const dir = path.dirname(resolvedPath);
  ensureDir(dir, logger);
  logger?.info({ dbPath: resolvedPath }, "ingestion: opening sqlite database");

  let db: Database.Database;
  try {
    db = new Database(resolvedPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to open SQLite at ${resolvedPath}: ${message}. Ensure Node 20 is used and native build tools are installed.`
    );
  }

  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const schemaPath = path.resolve(__dirname, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf-8");
    db.exec(schema);
    db.exec("CREATE TABLE IF NOT EXISTS __write_test__(id INTEGER PRIMARY KEY); DROP TABLE __write_test__;");
    applyMigrations(db, logger);
    logger?.info({ dbPath: resolvedPath }, "ingestion: DB writable");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`ingestion: SQLite not writable at ${resolvedPath}: ${message}`);
  }

  return db;
}

function ensureDir(dir: string, logger?: FastifyBaseLogger): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger?.info({ dir }, "ingestion: created DB directory");
  }
}

export function applyMigrations(db: Database.Database, logger?: FastifyBaseLogger): void {
  migrateSessionReports(db, logger);
}

function migrateSessionReports(db: Database.Database, logger?: FastifyBaseLogger): void {
  const columns = db.prepare(`PRAGMA table_info(session_reports)`).all() as Array<{ name: string }>;
  const hasReportKind = columns.some((col) => col.name === "report_kind");

  const runMigration = db.transaction(() => {
    if (!hasReportKind) {
      logger?.info("ingestion: adding report_kind column to session_reports");
      db.exec(`ALTER TABLE session_reports ADD COLUMN report_kind TEXT NOT NULL DEFAULT 'POST_ROAST_V1';`);
    }

    db.exec(
      `UPDATE session_reports SET report_kind = 'POST_ROAST_V1' WHERE report_kind IS NULL OR report_kind = ''`
    );

    backfillReportJson(db, logger);
    dedupeReports(db, logger);

    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_session_reports_session_kind ON session_reports (session_id, report_kind)`
    );
  });

  runMigration();
}

function backfillReportJson(db: Database.Database, logger?: FastifyBaseLogger): void {
  const missingKind = db
    .prepare(`SELECT id, report_json FROM session_reports WHERE json_extract(report_json, '$.reportKind') IS NULL`)
    .all() as Array<{ id: number; report_json: string }>;

  if (!missingKind.length) return;

  logger?.info({ count: missingKind.length }, "ingestion: backfilling reportKind in report_json");
  const update = db.prepare(`UPDATE session_reports SET report_json = @reportJson WHERE id = @id`);
  for (const row of missingKind) {
    try {
      const parsed = JSON.parse(row.report_json) as Record<string, unknown>;
      const updated = JSON.stringify({ ...parsed, reportKind: "POST_ROAST_V1" });
      update.run({ id: row.id, reportJson: updated });
    } catch {
      // Leave invalid JSON as-is; parsing will fail later.
    }
  }
}

function dedupeReports(db: Database.Database, logger?: FastifyBaseLogger): void {
  const duplicates = db
    .prepare(`
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY session_id, report_kind ORDER BY created_at DESC, id DESC) AS rn
        FROM session_reports
      )
      WHERE rn > 1
    `)
    .all() as Array<{ id: number }>;

  if (!duplicates.length) return;

  logger?.warn({ count: duplicates.length }, "ingestion: removing duplicate session reports");
  const del = db.prepare(`DELETE FROM session_reports WHERE id = @id`);
  for (const row of duplicates) {
    del.run({ id: row.id });
  }
}
