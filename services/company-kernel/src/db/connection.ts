import fs from "node:fs";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import Database from "better-sqlite3";

const DEFAULT_DB_PATH = "./var/kernel.db";
const __dirname = path.dirname(new URL(import.meta.url).pathname);

export function openKernelDatabase(
  dbPath: string = process.env.KERNEL_DB_PATH ?? DEFAULT_DB_PATH,
  logger?: FastifyBaseLogger
): Database.Database {
  const resolvedPath = path.resolve(dbPath);
  const dir = path.dirname(resolvedPath);
  ensureDir(dir, logger);
  logger?.info({ dbPath: resolvedPath }, "kernel: opening sqlite database");

  let db: Database.Database;
  try {
    db = new Database(resolvedPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`kernel: failed to open SQLite at ${resolvedPath}: ${message}`);
  }

  try {
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    const schemaPath = path.resolve(__dirname, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf-8");
    db.exec(schema);
    applyMigrations(db, logger);
    db.exec("CREATE TABLE IF NOT EXISTS __write_test__(id INTEGER PRIMARY KEY); DROP TABLE __write_test__;");
    logger?.info({ dbPath: resolvedPath }, "kernel: DB writable");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`kernel: SQLite not writable at ${resolvedPath}: ${message}`);
  }

  return db;
}

function ensureDir(dir: string, logger?: FastifyBaseLogger): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    logger?.info({ dir }, "kernel: created DB directory");
  }
}

function applyMigrations(db: Database.Database, logger?: FastifyBaseLogger): void {
  const missionColumns = db.prepare(`PRAGMA table_info(missions)`).all() as Array<{ name: string }>;
  const columnNames = missionColumns.map((c) => c.name);
  const addColumn = (name: string, ddl: string) => {
    if (!columnNames.includes(name)) {
      db.exec(`ALTER TABLE missions ADD COLUMN ${ddl}`);
      logger?.info({ column: name }, "kernel: added column to missions");
    }
  };

  addColumn("subject_id", "subject_id TEXT NULL");
  addColumn("context_json", "context_json TEXT NULL");
  addColumn("signals_json", "signals_json TEXT NULL");
  addColumn("governance_json", "governance_json TEXT NULL");

  db.exec(
    `CREATE INDEX IF NOT EXISTS idx_missions_subject_goal_status ON missions (subject_id, goal, status);
     CREATE INDEX IF NOT EXISTS idx_missions_status_goal_created ON missions (status, goal, created_at);`
  );

  db.exec(
    `CREATE TABLE IF NOT EXISTS kernel_settings (
       key TEXT PRIMARY KEY,
       value_json TEXT NOT NULL,
       updated_at TEXT NOT NULL
     );`
  );

  db.exec(
    `CREATE TABLE IF NOT EXISTS rate_limit_buckets (
       key TEXT PRIMARY KEY,
       tokens REAL NOT NULL,
       updated_at TEXT NOT NULL
     );`
  );
}
