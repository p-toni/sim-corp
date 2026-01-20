import type { FastifyBaseLogger } from "fastify";
import { createDatabaseFromEnv, type Database } from "@sim-corp/database";

const DEFAULT_DB_PATH = "./var/event-inference.db";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS machine_configs (
  key TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  machine_id TEXT NOT NULL,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_machine_configs_org_site_machine
  ON machine_configs (org_id, site_id, machine_id);
`;

/**
 * Open the event-inference database with support for both SQLite and PostgreSQL
 */
export async function getDatabase(
  dbPath?: string,
  logger?: FastifyBaseLogger
): Promise<Database> {
  // For SQLite: Use provided path or default
  if (!process.env.DATABASE_PATH && !process.env.DATABASE_TYPE) {
    process.env.DATABASE_PATH = dbPath ?? process.env.EVENT_INFERENCE_DB_PATH ?? DEFAULT_DB_PATH;
  }

  const dbLogger = {
    info: (msg: string, meta?: Record<string, unknown>) => logger?.info(meta, msg),
    error: (msg: string, meta?: Record<string, unknown>) => logger?.error(meta, msg),
    warn: (msg: string, meta?: Record<string, unknown>) => logger?.warn(meta, msg),
  };

  logger?.info({ type: process.env.DATABASE_TYPE ?? 'sqlite' }, "event-inference: opening database");

  const db = await createDatabaseFromEnv({
    schema: SCHEMA,
    logger: dbLogger,
  });

  return db;
}
