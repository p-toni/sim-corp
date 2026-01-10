/**
 * Database migration utilities
 */
import type { Database } from './types.js';

/**
 * Migration definition
 */
export interface Migration {
  id: string;
  name: string;
  up: (db: Database) => Promise<void>;
  down?: (db: Database) => Promise<void>;
}

/**
 * Migration history entry
 */
export interface MigrationHistory {
  id: string;
  name: string;
  appliedAt: string;
}

/**
 * Migration runner
 */
export class MigrationRunner {
  constructor(private db: Database) {}

  /**
   * Initialize migrations table
   */
  private async ensureMigrationsTable(): Promise<void> {
    if (this.db.type === 'sqlite') {
      await this.db.execRaw(`
        CREATE TABLE IF NOT EXISTS __migrations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL
        );
      `);
    } else if (this.db.type === 'postgres') {
      await this.db.execRaw(`
        CREATE TABLE IF NOT EXISTS __migrations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL
        );
      `);
    }
  }

  /**
   * Get list of applied migrations
   */
  async getAppliedMigrations(): Promise<MigrationHistory[]> {
    await this.ensureMigrationsTable();
    const result = await this.db.query<MigrationHistory>(
      'SELECT id, name, applied_at as "appliedAt" FROM __migrations ORDER BY applied_at'
    );
    return result.rows;
  }

  /**
   * Check if a migration has been applied
   */
  async isMigrationApplied(id: string): Promise<boolean> {
    await this.ensureMigrationsTable();
    const result = await this.db.query<{ count: number }>(
      'SELECT COUNT(*) as count FROM __migrations WHERE id = ?',
      [id]
    );
    const row = result.rows[0];
    return row ? row.count > 0 : false;
  }

  /**
   * Record a migration as applied
   */
  private async recordMigration(id: string, name: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db.exec(
      'INSERT INTO __migrations (id, name, applied_at) VALUES (?, ?, ?)',
      [id, name, now]
    );
  }

  /**
   * Remove a migration from history
   */
  private async removeMigration(id: string): Promise<void> {
    await this.db.exec('DELETE FROM __migrations WHERE id = ?', [id]);
  }

  /**
   * Run migrations that haven't been applied yet
   */
  async runMigrations(migrations: Migration[]): Promise<string[]> {
    const applied: string[] = [];

    for (const migration of migrations) {
      const isApplied = await this.isMigrationApplied(migration.id);
      if (!isApplied) {
        console.log(`Running migration: ${migration.id} - ${migration.name}`);
        await migration.up(this.db);
        await this.recordMigration(migration.id, migration.name);
        applied.push(migration.id);
        console.log(`✓ Migration ${migration.id} completed`);
      }
    }

    return applied;
  }

  /**
   * Rollback a specific migration
   */
  async rollback(migration: Migration): Promise<void> {
    if (!migration.down) {
      throw new Error(`Migration ${migration.id} does not support rollback`);
    }

    const isApplied = await this.isMigrationApplied(migration.id);
    if (!isApplied) {
      throw new Error(`Migration ${migration.id} has not been applied`);
    }

    console.log(`Rolling back migration: ${migration.id} - ${migration.name}`);
    await migration.down(this.db);
    await this.removeMigration(migration.id);
    console.log(`✓ Migration ${migration.id} rolled back`);
  }

  /**
   * Rollback all migrations in reverse order
   */
  async rollbackAll(migrations: Migration[]): Promise<void> {
    const reversedMigrations = [...migrations].reverse();

    for (const migration of reversedMigrations) {
      const isApplied = await this.isMigrationApplied(migration.id);
      if (isApplied && migration.down) {
        await this.rollback(migration);
      }
    }
  }
}

/**
 * SQL dialect converter utilities
 */
export class SQLDialectConverter {
  /**
   * Convert SQLite schema to PostgreSQL
   */
  static sqliteToPostgres(sqliteSQL: string): string {
    let sql = sqliteSQL;

    // Convert AUTOINCREMENT to SERIAL
    sql = sql.replace(/INTEGER\s+PRIMARY\s+KEY\s+AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
    sql = sql.replace(/INTEGER\s+AUTOINCREMENT/gi, 'SERIAL');

    // Convert TEXT columns that store timestamps to TIMESTAMPTZ
    sql = sql.replace(/created_at\s+TEXT/gi, 'created_at TIMESTAMPTZ');
    sql = sql.replace(/updated_at\s+TEXT/gi, 'updated_at TIMESTAMPTZ');
    sql = sql.replace(/completed_at\s+TEXT/gi, 'completed_at TIMESTAMPTZ');
    sql = sql.replace(/failed_at\s+TEXT/gi, 'failed_at TIMESTAMPTZ');
    sql = sql.replace(/claimed_at\s+TEXT/gi, 'claimed_at TIMESTAMPTZ');
    sql = sql.replace(/expires_at\s+TEXT/gi, 'expires_at TIMESTAMPTZ');
    sql = sql.replace(/applied_at\s+TEXT/gi, 'applied_at TIMESTAMPTZ');
    sql = sql.replace(/timestamp\s+TEXT/gi, 'timestamp TIMESTAMPTZ');
    sql = sql.replace(/_at\s+TEXT/gi, '_at TIMESTAMPTZ');

    // Convert JSON columns to JSONB
    sql = sql.replace(/(\w+_json)\s+TEXT/gi, '$1 JSONB');

    // Convert IF NOT EXISTS (PostgreSQL supports this)
    // No change needed

    // Convert SQLite-specific pragmas (remove them)
    sql = sql.replace(/PRAGMA\s+.+;/gi, '');

    // Remove AUTOINCREMENT from remaining INTEGER definitions
    sql = sql.replace(/INTEGER/gi, 'INTEGER');

    // Convert INTEGER to INT where appropriate
    sql = sql.replace(/\bINTEGER\b/g, 'INTEGER');

    return sql;
  }

  /**
   * Convert parameter placeholders from ? to $1, $2, etc.
   */
  static convertPlaceholders(sql: string, dialect: 'sqlite' | 'postgres'): string {
    if (dialect === 'postgres') {
      let index = 1;
      return sql.replace(/\?/g, () => `$${index++}`);
    }
    return sql;
  }
}

/**
 * Helper to create a simple migration
 */
export function createMigration(
  id: string,
  name: string,
  up: (db: Database) => Promise<void>,
  down?: (db: Database) => Promise<void>
): Migration {
  return { id, name, up, down };
}
