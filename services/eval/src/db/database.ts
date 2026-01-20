/**
 * Database connection for eval service
 * Uses @sim-corp/database abstraction layer for SQLite/PostgreSQL support
 */

import { createDatabase, type Database, type DatabaseFactoryConfig } from '@sim-corp/database';
import { join } from 'node:path';

let dbInstance: Database | null = null;

const SCHEMA = `
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
    baseline_commands_json TEXT DEFAULT '[]',

    -- T-028.2: Multiple trials support
    trials_required INTEGER DEFAULT 1,
    pass_at_k_threshold REAL,

    -- T-028.2: Negative test cases
    expectation TEXT DEFAULT 'SHOULD_SUCCEED',
    reject_reason_expected TEXT,
    danger_level TEXT DEFAULT 'SAFE',

    -- Reference solution
    reference_solution_json TEXT,

    -- Source tracking
    source_type TEXT DEFAULT 'SYNTHETIC',
    source_session_id TEXT,
    failure_mode TEXT,

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

    -- T-028.2: Trial tracking
    trial_number INTEGER,
    trial_set_id TEXT,
    total_trials INTEGER,

    outcome TEXT NOT NULL,
    passed_gates_json TEXT DEFAULT '[]',
    failed_gates_json TEXT DEFAULT '[]',

    -- T-028.2: Rejection tracking
    agent_rejected INTEGER DEFAULT 0,
    rejection_reason TEXT,
    rejection_appropriate INTEGER,

    detailed_metrics_json TEXT,
    metrics_json TEXT DEFAULT '[]',
    lm_judge_json TEXT,
    commands_json TEXT DEFAULT '[]',

    -- T-028.2 Phase 3: Agent transcript
    agent_transcript_json TEXT,

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
  CREATE INDEX IF NOT EXISTS idx_eval_runs_trial_set ON eval_runs(trial_set_id);
`;

/**
 * Get or create database connection
 */
export async function getDatabase(path?: string): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = path ?? process.env.EVAL_DB_PATH ?? join(process.cwd(), 'data', 'eval.db');
  const type = (process.env.DATABASE_TYPE as 'sqlite' | 'postgres') || 'sqlite';

  const config: DatabaseFactoryConfig = {
    type,
    schema: SCHEMA,
    logger: {
      info: (msg, meta) => console.log(`[Eval DB]`, msg, meta || ''),
      error: (msg, meta) => console.error(`[Eval DB]`, msg, meta || ''),
      warn: (msg, meta) => console.warn(`[Eval DB]`, msg, meta || ''),
    },
  };

  if (type === 'sqlite') {
    config.path = dbPath;
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

  console.log(`[Eval] Database initialized (${dbInstance.type})`);

  return dbInstance;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    console.log('[Eval] Database closed');
  }
}
