import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteAdapter } from '../src/sqlite-adapter.js';
import type { Database } from '../src/types.js';
import { mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

describe('SQLiteAdapter', () => {
  let db: Database;
  const testDir = join(process.cwd(), 'test-db');
  const testDbPath = join(testDir, 'test.db');

  beforeEach(async () => {
    // Create test directory
    if (!existsSync(testDir)) {
      mkdirSync(testDir, { recursive: true });
    }

    // Create adapter
    db = new SQLiteAdapter({
      path: testDbPath,
    });

    // Initialize test schema
    await db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  });

  afterEach(async () => {
    await db.close();
    // Clean up test database
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('exec', () => {
    it('should insert a record', async () => {
      const result = await db.exec(
        'INSERT INTO users (name, email) VALUES (?, ?)',
        ['Alice', 'alice@example.com']
      );

      expect(result.changes).toBe(1);
      expect(result.lastInsertId).toBeGreaterThan(0);
    });

    it('should update multiple records', async () => {
      await db.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com']);
      await db.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Bob', 'bob@example.com']);

      const result = await db.exec('UPDATE users SET name = ?', ['Charlie']);

      expect(result.changes).toBe(2);
    });

    it('should delete a record', async () => {
      await db.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com']);

      const result = await db.exec('DELETE FROM users WHERE email = ?', ['alice@example.com']);

      expect(result.changes).toBe(1);
    });
  });

  describe('query', () => {
    beforeEach(async () => {
      await db.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com']);
      await db.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Bob', 'bob@example.com']);
      await db.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Charlie', 'charlie@example.com']);
    });

    it('should select all records', async () => {
      const result = await db.query<{ id: number; name: string; email: string }>('SELECT * FROM users');

      expect(result.rows).toHaveLength(3);
      expect(result.rowCount).toBe(3);
      expect(result.rows[0]).toHaveProperty('name');
      expect(result.rows[0]).toHaveProperty('email');
    });

    it('should select with WHERE clause', async () => {
      const result = await db.query<{ name: string }>('SELECT name FROM users WHERE email = ?', [
        'alice@example.com',
      ]);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].name).toBe('Alice');
    });

    it('should return empty result for no matches', async () => {
      const result = await db.query('SELECT * FROM users WHERE email = ?', ['notfound@example.com']);

      expect(result.rows).toHaveLength(0);
      expect(result.rowCount).toBe(0);
    });
  });

  describe('prepared statements', () => {
    beforeEach(async () => {
      await db.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com']);
    });

    it('should get single record', async () => {
      const stmt = db.prepare<{ name: string; email: string }>(
        'SELECT name, email FROM users WHERE email = ?'
      );

      const result = await stmt.get(['alice@example.com']);

      expect(result).toBeDefined();
      expect(result?.name).toBe('Alice');
      expect(result?.email).toBe('alice@example.com');
    });

    it('should return undefined for no match', async () => {
      const stmt = db.prepare('SELECT * FROM users WHERE email = ?');

      const result = await stmt.get(['notfound@example.com']);

      expect(result).toBeUndefined();
    });
  });

  describe('withTransaction', () => {
    it('should commit transaction on success', async () => {
      await db.withTransaction(async (tx) => {
        await tx.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com']);
        await tx.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Bob', 'bob@example.com']);
      });

      const result = await db.query('SELECT * FROM users');
      expect(result.rowCount).toBe(2);
    });

    it('should rollback transaction on error', async () => {
      try {
        await db.withTransaction(async (tx) => {
          await tx.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com']);
          // Intentional error: duplicate email
          await tx.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Bob', 'alice@example.com']);
        });
      } catch (error) {
        // Expected error
      }

      const result = await db.query('SELECT * FROM users');
      expect(result.rowCount).toBe(0);
    });

    it('should support multiple operations in transaction', async () => {
      await db.withTransaction(async (tx) => {
        await tx.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Alice', 'alice@example.com']);
        await tx.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Bob', 'bob@example.com']);
        await tx.exec('INSERT INTO users (name, email) VALUES (?, ?)', ['Charlie', 'charlie@example.com']);
      });

      const result = await db.query('SELECT * FROM users');
      expect(result.rowCount).toBe(3);
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status', async () => {
      const health = await db.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy after close', async () => {
      await db.close();

      const health = await db.healthCheck();

      expect(health.healthy).toBe(false);
      expect(health.error).toBeDefined();
    });
  });

  describe('getPoolStats', () => {
    it('should return null for SQLite (no connection pool)', () => {
      const stats = db.getPoolStats();

      expect(stats).toBeNull();
    });
  });

  describe('execRaw', () => {
    it('should execute raw SQL', async () => {
      await db.execRaw('DELETE FROM users');

      const result = await db.query('SELECT * FROM users');
      expect(result.rowCount).toBe(0);
    });
  });
});
