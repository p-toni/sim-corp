import { createDatabase, type Database, type DatabaseFactoryConfig } from '@sim-corp/database';
import { join } from 'node:path';

let dbInstance: Database | null = null;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS command_proposals (
    proposal_id TEXT PRIMARY KEY,
    command_id TEXT NOT NULL,
    command_type TEXT NOT NULL,
    machine_id TEXT NOT NULL,
    site_id TEXT,
    org_id TEXT,
    target_value REAL,
    target_unit TEXT,
    constraints TEXT,
    metadata TEXT,

    proposed_by TEXT NOT NULL,
    proposed_by_actor TEXT,
    agent_name TEXT,
    agent_version TEXT,
    reasoning TEXT NOT NULL,
    session_id TEXT,
    mission_id TEXT,

    status TEXT NOT NULL DEFAULT 'PROPOSED',
    created_at TEXT NOT NULL,

    approval_required INTEGER NOT NULL DEFAULT 1,
    approval_timeout_seconds INTEGER NOT NULL DEFAULT 300,
    approved_by TEXT,
    approved_at TEXT,
    rejected_by TEXT,
    rejected_at TEXT,
    rejection_reason TEXT,

    execution_started_at TEXT,
    execution_completed_at TEXT,
    execution_duration_ms INTEGER,

    outcome TEXT,
    audit_log TEXT NOT NULL DEFAULT '[]'
  );

  CREATE INDEX IF NOT EXISTS idx_proposals_status ON command_proposals(status);
  CREATE INDEX IF NOT EXISTS idx_proposals_machine ON command_proposals(machine_id);
  CREATE INDEX IF NOT EXISTS idx_proposals_session ON command_proposals(session_id);
  CREATE INDEX IF NOT EXISTS idx_proposals_created ON command_proposals(created_at);
`;

export async function getDatabase(path?: string): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const dbPath = path ?? process.env.COMMAND_DB_PATH ?? join(process.cwd(), 'var', 'command.db');
  const type = (process.env.DATABASE_TYPE as 'sqlite' | 'postgres') || 'sqlite';

  const config: DatabaseFactoryConfig = {
    type,
    schema: SCHEMA,
    logger: {
      info: (msg, meta) => console.log(`[Command DB]`, msg, meta || ''),
      error: (msg, meta) => console.error(`[Command DB]`, msg, meta || ''),
      warn: (msg, meta) => console.warn(`[Command DB]`, msg, meta || ''),
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
  console.log(`[Command] Database initialized (${dbInstance.type})`);
  return dbInstance;
}
