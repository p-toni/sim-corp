/**
 * Database abstraction types
 * Provides a unified interface for SQLite and PostgreSQL
 */

export type DatabaseType = 'sqlite' | 'postgres';

/**
 * Configuration for database connection
 */
export interface DatabaseConfig {
  type: DatabaseType;

  // SQLite options
  path?: string;

  // PostgreSQL options
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  password?: string;
  ssl?: boolean;

  // Connection pooling (PostgreSQL only)
  poolMin?: number;
  poolMax?: number;

  // Logging
  logger?: DatabaseLogger;
}

/**
 * Logger interface for database operations
 */
export interface DatabaseLogger {
  info: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  debug?: (msg: string, meta?: Record<string, unknown>) => void;
}

/**
 * Result of a query operation
 */
export interface QueryResult<T = unknown> {
  rows: T[];
  rowCount: number;
}

/**
 * Result of an execute operation (INSERT, UPDATE, DELETE)
 */
export interface ExecResult {
  changes: number;
  lastInsertId?: number | string;
}

/**
 * Prepared statement interface
 */
export interface PreparedStatement<T = unknown> {
  all(params?: unknown[]): Promise<T[]>;
  get(params?: unknown[]): Promise<T | undefined>;
  run(params?: unknown[]): Promise<ExecResult>;
  finalize(): void;
}

/**
 * Transaction interface
 */
export interface Transaction {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  exec(sql: string, params?: unknown[]): Promise<ExecResult>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

/**
 * Core database interface implemented by all adapters
 */
export interface Database {
  /**
   * Database type (sqlite or postgres)
   */
  readonly type: DatabaseType;

  /**
   * Execute a query and return rows
   */
  query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;

  /**
   * Execute a statement (INSERT, UPDATE, DELETE) and return affected rows
   */
  exec(sql: string, params?: unknown[]): Promise<ExecResult>;

  /**
   * Execute raw SQL (for schema creation, migrations)
   * Does not return results
   */
  execRaw(sql: string): Promise<void>;

  /**
   * Prepare a statement for multiple executions
   */
  prepare<T = unknown>(sql: string): PreparedStatement<T>;

  /**
   * Begin a transaction
   */
  transaction(): Promise<Transaction>;

  /**
   * Run a function within a transaction
   */
  withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T>;

  /**
   * Check if database is healthy/connected
   */
  healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }>;

  /**
   * Close the database connection
   */
  close(): Promise<void>;
}

/**
 * Database factory configuration
 */
export interface DatabaseFactoryConfig extends DatabaseConfig {
  // Schema SQL to execute on connection (optional)
  schema?: string;

  // Migration function to run after schema (optional)
  migrate?: (db: Database) => Promise<void>;
}
