import Database from "better-sqlite3";
import { join } from "node:path";

export function openDatabase(path?: string): Database.Database {
  const dbPath = path ?? process.env.EVAL_DB_PATH ?? join(process.cwd(), "data", "eval.db");
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS golden_cases (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      origin TEXT,
      processing_method TEXT,
      variety TEXT,
      crop_year TEXT,
      machine_id TEXT NOT NULL,
      batch_size_kg REAL,
      charge_temp_c REAL,
      target_fc_seconds REAL,
      target_drop_seconds REAL,
      target_dev_percentage REAL,
      target_fc_temp_c REAL,
      target_drop_temp_c REAL,
      target_roast_color TEXT,
      fc_seconds_tolerance REAL,
      drop_seconds_tolerance REAL,
      dev_percentage_tolerance REAL,
      max_ror_spikes INTEGER,
      max_ror_crashes INTEGER,
      sensory_min_score REAL,
      sensory_notes_json TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT,
      tags_json TEXT DEFAULT '[]',
      archived INTEGER DEFAULT 0,
      metadata_json TEXT DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_golden_cases_machine ON golden_cases(machine_id);
    CREATE INDEX IF NOT EXISTS idx_golden_cases_archived ON golden_cases(archived);

    CREATE TABLE IF NOT EXISTS eval_runs (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      mission_id TEXT,
      golden_case_id TEXT,
      run_at TEXT NOT NULL,
      evaluator_id TEXT,
      outcome TEXT NOT NULL,
      passed_gates_json TEXT DEFAULT '[]',
      failed_gates_json TEXT DEFAULT '[]',
      detailed_metrics_json TEXT,
      metrics_json TEXT DEFAULT '[]',
      lm_judge_json TEXT,
      human_reviewed INTEGER DEFAULT 0,
      human_outcome TEXT,
      human_notes TEXT,
      reviewed_by TEXT,
      reviewed_at TEXT,
      org_id TEXT,
      notes TEXT,
      artifacts_json TEXT DEFAULT '[]',
      FOREIGN KEY (golden_case_id) REFERENCES golden_cases(id)
    );

    CREATE INDEX IF NOT EXISTS idx_eval_runs_session ON eval_runs(session_id);
    CREATE INDEX IF NOT EXISTS idx_eval_runs_golden_case ON eval_runs(golden_case_id);
    CREATE INDEX IF NOT EXISTS idx_eval_runs_outcome ON eval_runs(outcome);
    CREATE INDEX IF NOT EXISTS idx_eval_runs_org ON eval_runs(org_id);
  `);
}
