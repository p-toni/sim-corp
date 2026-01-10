/**
 * @sim-corp/database - Database abstraction layer
 *
 * Provides a unified interface for SQLite and PostgreSQL databases,
 * enabling services to run in local development (SQLite) and production (PostgreSQL)
 * with the same codebase.
 *
 * @example
 * ```typescript
 * import { createDatabase, createDatabaseFromEnv } from '@sim-corp/database';
 *
 * // Create from explicit config
 * const db = await createDatabase({
 *   type: 'postgres',
 *   host: 'localhost',
 *   database: 'mydb',
 *   user: 'myuser',
 *   password: 'mypass',
 *   schema: schemaSQL,
 *   migrate: async (db) => {
 *     // Run migrations
 *   }
 * });
 *
 * // Create from environment variables
 * const db = await createDatabaseFromEnv({
 *   schema: schemaSQL,
 *   migrate: async (db) => {
 *     // Run migrations
 *   }
 * });
 *
 * // Use the database
 * const result = await db.query('SELECT * FROM users WHERE id = ?', [userId]);
 * await db.exec('INSERT INTO users (name) VALUES (?)', ['Alice']);
 *
 * // Transactions
 * await db.withTransaction(async (tx) => {
 *   await tx.exec('INSERT INTO users (name) VALUES (?)', ['Bob']);
 *   await tx.exec('UPDATE accounts SET balance = balance + 100');
 * });
 *
 * // Health check
 * const health = await db.healthCheck();
 * console.log(health); // { healthy: true, latency: 2 }
 *
 * // Close connection
 * await db.close();
 * ```
 */

export type {
  Database,
  DatabaseConfig,
  DatabaseFactoryConfig,
  DatabaseLogger,
  DatabaseType,
  ExecResult,
  PreparedStatement,
  QueryResult,
  Transaction,
} from './types.js';

export { SQLiteAdapter } from './sqlite-adapter.js';
export { PostgresAdapter } from './postgres-adapter.js';
export { createDatabase, createDatabaseFromEnv } from './factory.js';
export {
  MigrationRunner,
  SQLDialectConverter,
  createMigration,
  type Migration,
  type MigrationHistory,
} from './migrations.js';
