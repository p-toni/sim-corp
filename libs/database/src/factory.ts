/**
 * Database factory - creates the appropriate adapter based on configuration
 */
import type { Database, DatabaseConfig, DatabaseFactoryConfig } from './types.js';
import { PostgresAdapter } from './postgres-adapter.js';
import { SQLiteAdapter } from './sqlite-adapter.js';

/**
 * Create a database instance based on configuration
 *
 * @param config - Database configuration
 * @returns Database instance
 *
 * @example
 * ```typescript
 * // SQLite (local development)
 * const db = await createDatabase({
 *   type: 'sqlite',
 *   path: './data/my.db',
 *   schema: fs.readFileSync('./schema.sql', 'utf-8'),
 *   migrate: async (db) => {
 *     // Run migrations
 *   }
 * });
 *
 * // PostgreSQL (production)
 * const db = await createDatabase({
 *   type: 'postgres',
 *   host: 'localhost',
 *   port: 5432,
 *   database: 'mydb',
 *   user: 'myuser',
 *   password: 'mypass',
 *   poolMin: 2,
 *   poolMax: 10,
 *   schema: fs.readFileSync('./schema.sql', 'utf-8'),
 *   migrate: async (db) => {
 *     // Run migrations
 *   }
 * });
 * ```
 */
export async function createDatabase(config: DatabaseFactoryConfig): Promise<Database> {
  let db: Database;

  // Create adapter based on type
  if (config.type === 'sqlite') {
    db = new SQLiteAdapter(config);
  } else if (config.type === 'postgres') {
    db = new PostgresAdapter(config);
  } else {
    throw new Error(`Unsupported database type: ${config.type}`);
  }

  // Execute schema if provided
  if (config.schema) {
    config.logger?.info('Executing database schema');
    try {
      await db.execRaw(config.schema);
      config.logger?.info('Schema executed successfully');
    } catch (error) {
      config.logger?.error('Failed to execute schema', { error });
      throw error;
    }
  }

  // Run migrations if provided
  if (config.migrate) {
    config.logger?.info('Running database migrations');
    try {
      await config.migrate(db);
      config.logger?.info('Migrations completed successfully');
    } catch (error) {
      config.logger?.error('Failed to run migrations', { error });
      throw error;
    }
  }

  return db;
}

/**
 * Create a database from environment variables
 *
 * Environment variables:
 * - DATABASE_TYPE: 'sqlite' or 'postgres' (default: 'sqlite')
 * - DATABASE_PATH: SQLite file path (required for SQLite)
 * - DATABASE_HOST: PostgreSQL host (required for PostgreSQL)
 * - DATABASE_PORT: PostgreSQL port (default: 5432)
 * - DATABASE_NAME: PostgreSQL database name (required for PostgreSQL)
 * - DATABASE_USER: PostgreSQL username
 * - DATABASE_PASSWORD: PostgreSQL password
 * - DATABASE_SSL: Enable SSL for PostgreSQL (default: false)
 * - DATABASE_POOL_MIN: Minimum pool connections (default: 2)
 * - DATABASE_POOL_MAX: Maximum pool connections (default: 10)
 *
 * @param options - Optional schema and migration functions
 * @returns Database instance
 */
export async function createDatabaseFromEnv(
  options?: {
    schema?: string;
    migrate?: (db: Database) => Promise<void>;
    logger?: DatabaseConfig['logger'];
  }
): Promise<Database> {
  const type = (process.env.DATABASE_TYPE as 'sqlite' | 'postgres') ?? 'sqlite';

  const config: DatabaseFactoryConfig = {
    type,
    logger: options?.logger,
    schema: options?.schema,
    migrate: options?.migrate,
  };

  if (type === 'sqlite') {
    config.path = process.env.DATABASE_PATH;
    if (!config.path) {
      throw new Error('DATABASE_PATH environment variable is required for SQLite');
    }
  } else if (type === 'postgres') {
    config.host = process.env.DATABASE_HOST;
    config.port = process.env.DATABASE_PORT ? Number.parseInt(process.env.DATABASE_PORT, 10) : 5432;
    config.database = process.env.DATABASE_NAME;
    config.user = process.env.DATABASE_USER;
    config.password = process.env.DATABASE_PASSWORD;
    config.ssl = process.env.DATABASE_SSL === 'true';
    config.poolMin = process.env.DATABASE_POOL_MIN
      ? Number.parseInt(process.env.DATABASE_POOL_MIN, 10)
      : 2;
    config.poolMax = process.env.DATABASE_POOL_MAX
      ? Number.parseInt(process.env.DATABASE_POOL_MAX, 10)
      : 10;

    if (!config.host || !config.database) {
      throw new Error('DATABASE_HOST and DATABASE_NAME environment variables are required for PostgreSQL');
    }
  }

  return createDatabase(config);
}
