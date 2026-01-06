import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const DB_PATH = process.env.COMMAND_DB_PATH ?? "./var/command.db";

export function openDatabase(): Database.Database {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  initializeSchema(db);
  return db;
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS command_proposals (
      proposal_id TEXT PRIMARY KEY,
      command_id TEXT NOT NULL,
      command_type TEXT NOT NULL,
      machine_id TEXT NOT NULL,
      site_id TEXT,
      org_id TEXT,
      target_value REAL,
      target_unit TEXT,
      constraints TEXT, -- JSON
      metadata TEXT, -- JSON

      proposed_by TEXT NOT NULL, -- AGENT or HUMAN
      proposed_by_actor TEXT, -- JSON
      agent_name TEXT,
      agent_version TEXT,
      reasoning TEXT NOT NULL,
      session_id TEXT,
      mission_id TEXT,

      status TEXT NOT NULL DEFAULT 'PROPOSED',
      created_at TEXT NOT NULL,

      approval_required INTEGER NOT NULL DEFAULT 1,
      approval_timeout_seconds INTEGER NOT NULL DEFAULT 300,
      approved_by TEXT, -- JSON Actor
      approved_at TEXT,
      rejected_by TEXT, -- JSON Actor
      rejected_at TEXT,
      rejection_reason TEXT, -- JSON

      execution_started_at TEXT,
      execution_completed_at TEXT,
      execution_duration_ms INTEGER,

      outcome TEXT, -- JSON
      audit_log TEXT NOT NULL DEFAULT '[]' -- JSON array
    );

    CREATE INDEX IF NOT EXISTS idx_proposals_status ON command_proposals(status);
    CREATE INDEX IF NOT EXISTS idx_proposals_machine ON command_proposals(machine_id);
    CREATE INDEX IF NOT EXISTS idx_proposals_session ON command_proposals(session_id);
    CREATE INDEX IF NOT EXISTS idx_proposals_created ON command_proposals(created_at);
  `);
}
