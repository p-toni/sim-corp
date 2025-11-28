import fs from "node:fs";
import path from "node:path";
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
    const schemaPath = path.resolve(__dirname, "schema.sql");
    const schema = fs.readFileSync(schemaPath, "utf-8");
    db.exec(schema);
    db.exec("CREATE TABLE IF NOT EXISTS __write_test__(id INTEGER PRIMARY KEY); DROP TABLE __write_test__;");
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
