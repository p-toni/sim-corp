/**
 * PostgreSQL adapter using pg with connection pooling
 */
import pg from 'pg';
import type {
  Database,
  DatabaseConfig,
  DatabaseType,
  ExecResult,
  PreparedStatement,
  QueryResult,
  Transaction,
} from './types.js';

const { Pool } = pg;

export class PostgresAdapter implements Database {
  readonly type: DatabaseType = 'postgres';
  private pool: pg.Pool;
  private logger?: DatabaseConfig['logger'];

  constructor(config: DatabaseConfig) {
    if (!config.host || !config.database) {
      throw new Error('PostgreSQL adapter requires host and database');
    }

    this.logger = config.logger;

    const poolConfig: pg.PoolConfig = {
      host: config.host,
      port: config.port ?? 5432,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      min: config.poolMin ?? 2,
      max: config.poolMax ?? 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };

    this.logger?.info('Creating PostgreSQL connection pool', {
      host: config.host,
      port: poolConfig.port,
      database: config.database,
      min: poolConfig.min,
      max: poolConfig.max,
    });

    this.pool = new Pool(poolConfig);

    // Handle pool errors
    this.pool.on('error', (err) => {
      this.logger?.error('PostgreSQL pool error', { error: err });
    });
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    try {
      const result = await this.pool.query(sql, params);
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? 0,
      };
    } catch (error) {
      this.logger?.error('PostgreSQL query error', { sql, error });
      throw error;
    }
  }

  async exec(sql: string, params?: unknown[]): Promise<ExecResult> {
    try {
      const result = await this.pool.query(sql, params);
      return {
        changes: result.rowCount ?? 0,
        // PostgreSQL doesn't provide lastInsertId directly
        // Users should use RETURNING clause for INSERT operations
      };
    } catch (error) {
      this.logger?.error('PostgreSQL exec error', { sql, error });
      throw error;
    }
  }

  async execRaw(sql: string): Promise<void> {
    try {
      await this.pool.query(sql);
    } catch (error) {
      this.logger?.error('PostgreSQL execRaw error', { sql, error });
      throw error;
    }
  }

  prepare<T = unknown>(sql: string): PreparedStatement<T> {
    // PostgreSQL doesn't have true prepared statements in the same way as SQLite
    // We'll use parameterized queries instead
    return {
      all: async (params?: unknown[]) => {
        const result = await this.pool.query(sql, params);
        return result.rows as T[];
      },
      get: async (params?: unknown[]) => {
        const result = await this.pool.query(sql, params);
        return result.rows[0] as T | undefined;
      },
      run: async (params?: unknown[]) => {
        const result = await this.pool.query(sql, params);
        return {
          changes: result.rowCount ?? 0,
        };
      },
      finalize: () => {
        // No-op for PostgreSQL
      },
    };
  }

  async transaction(): Promise<Transaction> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      let committed = false;
      let rolledBack = false;

      const tx: Transaction = {
        query: async <T = unknown>(sql: string, params?: unknown[]) => {
          if (committed || rolledBack) {
            throw new Error('Transaction already finished');
          }
          const result = await client.query(sql, params);
          return {
            rows: result.rows as T[],
            rowCount: result.rowCount ?? 0,
          };
        },

        exec: async (sql: string, params?: unknown[]) => {
          if (committed || rolledBack) {
            throw new Error('Transaction already finished');
          }
          const result = await client.query(sql, params);
          return {
            changes: result.rowCount ?? 0,
          };
        },

        commit: async () => {
          if (committed || rolledBack) {
            throw new Error('Transaction already finished');
          }
          await client.query('COMMIT');
          committed = true;
          client.release();
        },

        rollback: async () => {
          if (committed || rolledBack) {
            throw new Error('Transaction already finished');
          }
          await client.query('ROLLBACK');
          rolledBack = true;
          client.release();
        },
      };

      return tx;
    } catch (error) {
      client.release();
      throw error;
    }
  }

  async withTransaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const tx = await this.transaction();
    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      const latency = Date.now() - start;
      return { healthy: true, latency };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { healthy: false, error: message };
    }
  }

  getPoolStats(): { size: number; active: number; idle: number; waiting: number } | null {
    return {
      size: this.pool.totalCount,
      active: this.pool.totalCount - this.pool.idleCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
    };
  }

  async close(): Promise<void> {
    try {
      await this.pool.end();
      this.logger?.info('PostgreSQL pool closed');
    } catch (error) {
      this.logger?.error('Error closing PostgreSQL pool', { error });
      throw error;
    }
  }
}
