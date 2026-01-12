/**
 * Database connection for governance service
 */

import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path
const DB_PATH = process.env.GOVERNANCE_DB_PATH || join(__dirname, '../../var/governance.db');

// Create database connection
export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Initialize schema
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

console.log(`[Governance] Database initialized at ${DB_PATH}`);

/**
 * Close database connection
 */
export function closeDatabase(): void {
  db.close();
}
