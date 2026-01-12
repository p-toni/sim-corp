/**
 * SQLite adapter using better-sqlite3
 */
import SQLite from 'better-sqlite3';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  Database,
  DatabaseConfig,
  DatabaseType,
  ExecResult,
  PreparedStatement,
  QueryResult,
  Transaction,
} from './types.js';

export class SQLiteAdapter implements Database {
  readonly type: DatabaseType = 'sqlite';
  private db: SQLite.Database;
  private logger?: DatabaseConfig['logger'];

  constructor(config: DatabaseConfig) {
    if (!config.path) {
      throw new Error('SQLite adapter requires a path');
    }

    const resolvedPath = path.resolve(config.path);
    const dir = path.dirname(resolvedPath);

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      config.logger?.info(`Created directory: ${dir}`);
    }

    this.logger = config.logger;
    this.logger?.info(`Opening SQLite database at: ${resolvedPath}`);

    try {
      this.db = new SQLite(resolvedPath);

      // Set pragmas for performance and safety
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('foreign_keys = ON');

      this.logger?.info('SQLite database opened successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to open SQLite database at ${resolvedPath}: ${message}`);
    }
  }

  async query<T = unknown>(sql: string, params?: unknown[]): Promise<QueryResult<T>> {
    try {
      const stmt = this.db.prepare(sql);
      const rows = params ? stmt.all(...params) : stmt.all();
      return {
        rows: rows as T[],
        rowCount: rows.length,
      };
    } catch (error) {
      this.logger?.error('SQLite query error', { sql, error });
      throw error;
    }
  }

  async exec(sql: string, params?: unknown[]): Promise<ExecResult> {
    try {
      const stmt = this.db.prepare(sql);
      const info = params ? stmt.run(...params) : stmt.run();
      return {
        changes: info.changes,
        lastInsertId: typeof info.lastInsertRowid === 'bigint'
          ? Number(info.lastInsertRowid)
          : info.lastInsertRowid,
      };
    } catch (error) {
      this.logger?.error('SQLite exec error', { sql, error });
      throw error;
    }
  }

  async execRaw(sql: string): Promise<void> {
    try {
      this.db.exec(sql);
    } catch (error) {
      this.logger?.error('SQLite execRaw error', { sql, error });
      throw error;
    }
  }

  prepare<T = unknown>(sql: string): PreparedStatement<T> {
    const stmt = this.db.prepare(sql);
    return {
      all: async (params?: unknown[]) => {
        const rows = params ? stmt.all(...params) : stmt.all();
        return rows as T[];
      },
      get: async (params?: unknown[]) => {
        const row = params ? stmt.get(...params) : stmt.get();
        return row as T | undefined;
      },
      run: async (params?: unknown[]) => {
        const info = params ? stmt.run(...params) : stmt.run();
        return {
          changes: info.changes,
          lastInsertId: typeof info.lastInsertRowid === 'bigint'
            ? Number(info.lastInsertRowid)
            : info.lastInsertRowid,
        };
      },
      finalize: () => {
        // better-sqlite3 doesn't require explicit finalization
      },
    };
  }

  async transaction(): Promise<Transaction> {
    // Begin transaction
    this.db.prepare('BEGIN').run();

    let committed = false;
    let rolledBack = false;

    const tx: Transaction = {
      query: async <T = unknown>(sql: string, params?: unknown[]) => {
        if (committed || rolledBack) {
          throw new Error('Transaction already finished');
        }
        return this.query<T>(sql, params);
      },

      exec: async (sql: string, params?: unknown[]) => {
        if (committed || rolledBack) {
          throw new Error('Transaction already finished');
        }
        return this.exec(sql, params);
      },

      commit: async () => {
        if (committed || rolledBack) {
          throw new Error('Transaction already finished');
        }
        this.db.prepare('COMMIT').run();
        committed = true;
      },

      rollback: async () => {
        if (committed || rolledBack) {
          throw new Error('Transaction already finished');
        }
        this.db.prepare('ROLLBACK').run();
        rolledBack = true;
      },
    };

    return tx;
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
      // Simple query to check if database is accessible
      this.db.prepare('SELECT 1').get();
      const latency = Date.now() - start;
      return { healthy: true, latency };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { healthy: false, error: message };
    }
  }

  getPoolStats(): null {
    // SQLite doesn't use connection pooling
    return null;
  }

  async close(): Promise<void> {
    try {
      this.db.close();
      this.logger?.info('SQLite database closed');
    } catch (error) {
      this.logger?.error('Error closing SQLite database', { error });
      throw error;
    }
  }
}
