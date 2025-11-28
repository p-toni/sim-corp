import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_DB_PATH = "./var/ingestion.db";

export function openDatabase(dbPath: string = process.env.INGESTION_DB_PATH ?? DEFAULT_DB_PATH): Database.Database {
  ensureDir(path.dirname(dbPath));
  const db = new Database(dbPath);
  const schemaPath = path.resolve(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);
  return db;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
