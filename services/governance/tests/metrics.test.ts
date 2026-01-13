/**
 * Tests for MetricsCollector and database repositories
 */

import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { MetricsCollector } from '../src/metrics/collector.js';
import {
  GovernanceStateRepo,
  CircuitBreakerRulesRepo,
  MetricsSnapshotsRepo,
} from '../src/db/repo.js';
import type { AutonomyMetrics } from '@sim-corp/schemas/kernel/governance';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create in-memory databases for testing
let governanceDb: Database.Database;
let commandDb: Database.Database;
let collector: MetricsCollector;

beforeEach(() => {
  // Setup governance database
  governanceDb = new Database(':memory:');
  const schema = readFileSync(join(__dirname, '../src/db/schema.sql'), 'utf8');
  governanceDb.exec(schema);

  // Setup mock command database
  commandDb = new Database(':memory:');
  commandDb.exec(`
    CREATE TABLE command_proposals (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL,
      execution_status TEXT,
      command TEXT NOT NULL,
      rejection_reason TEXT
    );
  `);

  // Create collector with mock command DB
  collector = new MetricsCollector({ commandDbPath: ':memory:' });
  // Override the commandDb for testing
  (collector as any).commandDb = commandDb;
});

describe('GovernanceStateRepo', () => {
  it('should get governance state', () => {
    const repo = new GovernanceStateRepo();
    (repo as any).db = governanceDb;

    const state = repo.getState();

    expect(state).toBeDefined();
    expect(state!.currentPhase).toBeDefined();
    expect(Array.isArray(state!.commandWhitelist)).toBe(true);
  });

  it('should update governance state', () => {
    const repo = new GovernanceStateRepo();
    (repo as any).db = governanceDb;

    repo.updateState({
      currentPhase: 'L4',
      commandWhitelist: ['SET_POWER', 'SET_FAN'],
    });

    const state = repo.getState();
    expect(state!.currentPhase).toBe('L4');
    expect(state!.commandWhitelist).toEqual(['SET_POWER', 'SET_FAN']);
  });
});

describe('CircuitBreakerRulesRepo', () => {
  it('should load default rules', () => {
    const repo = new CircuitBreakerRulesRepo();
    (repo as any).db = governanceDb;

    const rules = repo.getAll();

    expect(rules.length).toBeGreaterThan(0);
    expect(rules[0]).toHaveProperty('name');
    expect(rules[0]).toHaveProperty('enabled');
    expect(rules[0]).toHaveProperty('condition');
    expect(rules[0]).toHaveProperty('action');
  });

  it('should get only enabled rules', () => {
    const repo = new CircuitBreakerRulesRepo();
    (repo as any).db = governanceDb;

    const enabled = repo.getEnabled();
    expect(enabled.every(rule => rule.enabled)).toBe(true);
  });

  it('should update rule configuration', () => {
    const repo = new CircuitBreakerRulesRepo();
    (repo as any).db = governanceDb;

    repo.update('High Error Rate', {
      enabled: false,
      condition: 'errorRate > 0.10',
    });

    const rules = repo.getAll();
    const updated = rules.find(r => r.name === 'High Error Rate');

    expect(updated!.enabled).toBe(false);
    expect(updated!.condition).toBe('errorRate > 0.10');
  });
});

describe('MetricsCollector', () => {
  it('should collect metrics with no data', async () => {
    const start = new Date('2024-01-01');
    const end = new Date('2024-01-07');

    const metrics = await collector.collectAll({ start, end });

    expect(metrics.period.start).toEqual(start);
    expect(metrics.period.end).toEqual(end);
    expect(metrics.commands.total).toBe(0);
    expect(metrics.rates.successRate).toBe(0);
  });

  it('should collect command metrics', async () => {
    // Insert test data
    const now = new Date();
    commandDb.prepare(`
      INSERT INTO command_proposals (id, created_at, status, execution_status, command, rejection_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('1', now.toISOString(), 'executed', 'succeeded', '{"type":"SET_POWER"}', null);

    commandDb.prepare(`
      INSERT INTO command_proposals (id, created_at, status, execution_status, command, rejection_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('2', now.toISOString(), 'executed', 'failed', '{"type":"SET_FAN"}', null);

    commandDb.prepare(`
      INSERT INTO command_proposals (id, created_at, status, execution_status, command, rejection_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('3', now.toISOString(), 'rejected', null, '{"type":"SET_DRUM"}', 'constraint violation');

    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const metrics = await collector.collectAll({ start, end });

    expect(metrics.commands.total).toBe(3);
    expect(metrics.commands.succeeded).toBe(1);
    expect(metrics.commands.failed).toBe(1);
    expect(metrics.commands.rejected).toBe(1);
    expect(metrics.rates.successRate).toBe(0.5); // 1 success / 2 executions
    expect(metrics.safety.constraintViolations).toBe(1);
  });

  it('should calculate rates correctly', async () => {
    const now = new Date();

    // 4 succeeded, 1 failed = 80% success rate
    for (let i = 0; i < 4; i++) {
      commandDb.prepare(`
        INSERT INTO command_proposals (id, created_at, status, execution_status, command, rejection_reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(`s${i}`, now.toISOString(), 'executed', 'succeeded', '{"type":"SET_POWER"}', null);
    }

    commandDb.prepare(`
      INSERT INTO command_proposals (id, created_at, status, execution_status, command, rejection_reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('f1', now.toISOString(), 'executed', 'failed', '{"type":"SET_FAN"}', null);

    const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const metrics = await collector.collectAll({ start, end });

    expect(metrics.rates.successRate).toBe(0.8);
    expect(metrics.rates.errorRate).toBe(0.2); // 1 failed / 5 total
  });
});

describe('MetricsSnapshotsRepo', () => {
  it('should save and retrieve metrics snapshot', () => {
    const repo = new MetricsSnapshotsRepo();
    (repo as any).db = governanceDb;

    const metrics: AutonomyMetrics = {
      period: {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-07'),
      },
      commands: {
        total: 100,
        proposed: 100,
        approved: 80,
        rejected: 20,
        succeeded: 75,
        failed: 5,
        rolledBack: 2,
      },
      rates: {
        successRate: 0.9375,
        approvalRate: 0.8,
        rollbackRate: 0.027,
        errorRate: 0.05,
      },
      incidents: {
        total: 0,
        critical: 0,
        fromAutonomousActions: 0,
      },
      safety: {
        constraintViolations: 5,
        emergencyAborts: 0,
        safetyGateTriggers: 3,
      },
    };

    repo.save(metrics);

    const latest = repo.getLatest();
    expect(latest).toBeDefined();
    expect(latest!.commands.total).toBe(100);
    expect(latest!.rates.successRate).toBe(0.9375);
    expect(latest!.safety.constraintViolations).toBe(5);
  });
});
