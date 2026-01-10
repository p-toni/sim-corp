import fs from "node:fs";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import { createDatabaseFromEnv, type Database, MigrationRunner, createMigration } from "@sim-corp/database";

const DEFAULT_DB_PATH = "./var/kernel.db";
const __dirname = path.dirname(new URL(import.meta.url).pathname);

/**
 * Open the kernel database with support for both SQLite and PostgreSQL
 *
 * Environment variables:
 * - DATABASE_TYPE: 'sqlite' or 'postgres' (default: 'sqlite')
 * - DATABASE_PATH: Path for SQLite database (default: KERNEL_DB_PATH or './var/kernel.db')
 * - DATABASE_HOST, DATABASE_NAME, etc. for PostgreSQL
 *
 * For backward compatibility, KERNEL_DB_PATH is still supported for SQLite.
 */
export async function openKernelDatabase(
  dbPath?: string,
  logger?: FastifyBaseLogger
): Promise<Database> {
  const schemaPath = path.resolve(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");

  // For SQLite: Use KERNEL_DB_PATH or provided path
  if (!process.env.DATABASE_PATH && !process.env.DATABASE_TYPE) {
    process.env.DATABASE_PATH = dbPath ?? process.env.KERNEL_DB_PATH ?? DEFAULT_DB_PATH;
  }

  const dbLogger = {
    info: (msg: string, meta?: Record<string, unknown>) => logger?.info(meta, msg),
    error: (msg: string, meta?: Record<string, unknown>) => logger?.error(meta, msg),
    warn: (msg: string, meta?: Record<string, unknown>) => logger?.warn(meta, msg),
  };

  logger?.info({ type: process.env.DATABASE_TYPE ?? 'sqlite' }, "kernel: opening database");

  const db = await createDatabaseFromEnv({
    schema,
    migrate: async (db) => {
      await applyMigrations(db, logger);
    },
    logger: dbLogger,
  });

  // Test database is writable
  try {
    await db.execRaw("CREATE TABLE IF NOT EXISTS __write_test__(id INTEGER PRIMARY KEY); DROP TABLE __write_test__;");
    logger?.info("kernel: database writable");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`kernel: database not writable: ${message}`);
  }

  return db;
}

async function applyMigrations(db: Database, logger?: FastifyBaseLogger): Promise<void> {
  const runner = new MigrationRunner(db);

  const migrations = [
    createMigration(
      '001_add_subject_columns',
      'Add subject_id, context_json, signals_json, governance_json, actor_json columns',
      async (db) => {
        // Get existing columns
        const result = await db.query<{ name: string }>(`
          SELECT name FROM pragma_table_info('missions')
        `);
        const columnNames = result.rows.map((c) => c.name);

        const addColumn = async (name: string, ddl: string) => {
          if (!columnNames.includes(name)) {
            await db.execRaw(`ALTER TABLE missions ADD COLUMN ${ddl}`);
            logger?.info({ column: name }, "kernel: added column to missions");
          }
        };

        await addColumn("subject_id", "subject_id TEXT NULL");
        await addColumn("context_json", "context_json TEXT NULL");
        await addColumn("signals_json", "signals_json TEXT NULL");
        await addColumn("governance_json", "governance_json TEXT NULL");
        await addColumn("actor_json", "actor_json TEXT NULL");
      }
    ),

    createMigration(
      '002_add_indexes',
      'Add composite indexes for common queries',
      async (db) => {
        await db.execRaw(`
          CREATE INDEX IF NOT EXISTS idx_missions_subject_goal_status
            ON missions (subject_id, goal, status);
          CREATE INDEX IF NOT EXISTS idx_missions_status_goal_created
            ON missions (status, goal, created_at);
        `);
      }
    ),

    createMigration(
      '003_create_settings_table',
      'Create kernel_settings table',
      async (db) => {
        if (db.type === 'sqlite') {
          await db.execRaw(`
            CREATE TABLE IF NOT EXISTS kernel_settings (
              key TEXT PRIMARY KEY,
              value_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
          `);
        } else {
          await db.execRaw(`
            CREATE TABLE IF NOT EXISTS kernel_settings (
              key TEXT PRIMARY KEY,
              value_json JSONB NOT NULL,
              updated_at TIMESTAMPTZ NOT NULL
            );
          `);
        }
      }
    ),

    createMigration(
      '004_create_rate_limit_table',
      'Create rate_limit_buckets table',
      async (db) => {
        if (db.type === 'sqlite') {
          await db.execRaw(`
            CREATE TABLE IF NOT EXISTS rate_limit_buckets (
              key TEXT PRIMARY KEY,
              tokens REAL NOT NULL,
              updated_at TEXT NOT NULL
            );
          `);
        } else {
          await db.execRaw(`
            CREATE TABLE IF NOT EXISTS rate_limit_buckets (
              key TEXT PRIMARY KEY,
              tokens REAL NOT NULL,
              updated_at TIMESTAMPTZ NOT NULL
            );
          `);
        }
      }
    ),
  ];

  await runner.runMigrations(migrations);
}
