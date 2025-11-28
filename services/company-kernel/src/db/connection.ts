import fs from "node:fs";
import path from "node:path";
import type { FastifyBaseLogger } from "fastify";
import Database from "better-sqlite3";

const DEFAULT_DB_PATH = "./var/kernel.db";

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
