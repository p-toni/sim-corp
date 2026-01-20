/**
 * Database connection for governance service
 * Uses @sim-corp/database abstraction layer for SQLite/PostgreSQL support
 */

import { createDatabase, type Database, type DatabaseFactoryConfig } from '@sim-corp/database';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let dbInstance: Database | null = null;

/**
 * Get or create database connection
 */
export async function getDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  const type = (process.env.DATABASE_TYPE as 'sqlite' | 'postgres') || 'sqlite';

  const config: DatabaseFactoryConfig = {
    type,
    schema,
    logger: {
      info: (msg, meta) => console.log(`[Governance DB]`, msg, meta || ''),
      error: (msg, meta) => console.error(`[Governance DB]`, msg, meta || ''),
      warn: (msg, meta) => console.warn(`[Governance DB]`, msg, meta || ''),
    },
  };

  if (type === 'sqlite') {
    config.path = process.env.GOVERNANCE_DB_PATH || join(__dirname, '../../var/governance.db');
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

  console.log(`[Governance] Database initialized (${dbInstance.type})`);

  return dbInstance;
}

/**
 * Close database connection
 */
export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
    console.log('[Governance] Database closed');
  }
}
