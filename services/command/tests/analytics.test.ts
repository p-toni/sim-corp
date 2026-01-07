import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createCommandAnalytics } from "../src/core/analytics";

describe("CommandAnalytics", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    // Initialize schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS command_proposals (
        proposal_id TEXT PRIMARY KEY,
        command_id TEXT NOT NULL,
        command_type TEXT NOT NULL,
        machine_id TEXT NOT NULL,
        site_id TEXT,
        org_id TEXT,
        target_value REAL,
        target_unit TEXT,
        constraints TEXT,
        metadata TEXT,
        proposed_by TEXT NOT NULL,
        proposed_by_actor TEXT,
        agent_name TEXT,
        agent_version TEXT,
        reasoning TEXT NOT NULL,
        session_id TEXT,
        mission_id TEXT,
        status TEXT NOT NULL DEFAULT 'PROPOSED',
        created_at TEXT NOT NULL,
        approval_required INTEGER NOT NULL DEFAULT 1,
        approval_timeout_seconds INTEGER NOT NULL DEFAULT 300,
        approved_by TEXT,
        approved_at TEXT,
        rejected_by TEXT,
        rejected_at TEXT,
        rejection_reason TEXT,
        execution_started_at TEXT,
        execution_completed_at TEXT,
        execution_duration_ms INTEGER,
        outcome TEXT,
        audit_log TEXT NOT NULL DEFAULT '[]'
      );

      CREATE INDEX IF NOT EXISTS idx_proposals_status ON command_proposals(status);
      CREATE INDEX IF NOT EXISTS idx_proposals_machine ON command_proposals(machine_id);
      CREATE INDEX IF NOT EXISTS idx_proposals_session ON command_proposals(session_id);
      CREATE INDEX IF NOT EXISTS idx_proposals_created ON command_proposals(created_at);
    `);
  });

  function insertTestProposal(override: any = {}) {
    const now = new Date().toISOString();
    const proposal = {
      proposal_id: `prop-${Date.now()}-${Math.random()}`,
      command_id: `cmd-${Date.now()}`,
      command_type: "SET_POWER",
      machine_id: "machine-1",
      site_id: null,
      org_id: null,
      target_value: 75,
      target_unit: "%",
      constraints: "{}",
      metadata: null,
      proposed_by: "AGENT",
      proposed_by_actor: null,
      agent_name: "test-agent",
      agent_version: "1.0.0",
      reasoning: "Test",
      session_id: null,
      mission_id: null,
      status: "COMPLETED",
      created_at: now,
      approval_required: 1,
      approval_timeout_seconds: 300,
      approved_by: null,
      approved_at: null,
      rejected_by: null,
      rejected_at: null,
      rejection_reason: null,
      execution_started_at: now,
      execution_completed_at: now,
      execution_duration_ms: 1000,
      outcome: null,
      audit_log: "[]",
      ...override,
    };

    db.prepare(
      `INSERT INTO command_proposals (
        proposal_id, command_id, command_type, machine_id, site_id, org_id,
        target_value, target_unit, constraints, metadata, proposed_by, proposed_by_actor,
        agent_name, agent_version, reasoning, session_id, mission_id, status, created_at,
        approval_required, approval_timeout_seconds, approved_by, approved_at,
        rejected_by, rejected_at, rejection_reason, execution_started_at,
        execution_completed_at, execution_duration_ms, outcome, audit_log
      ) VALUES (
        @proposal_id, @command_id, @command_type, @machine_id, @site_id, @org_id,
        @target_value, @target_unit, @constraints, @metadata, @proposed_by, @proposed_by_actor,
        @agent_name, @agent_version, @reasoning, @session_id, @mission_id, @status, @created_at,
        @approval_required, @approval_timeout_seconds, @approved_by, @approved_at,
        @rejected_by, @rejected_at, @rejection_reason, @execution_started_at,
        @execution_completed_at, @execution_duration_ms, @outcome, @audit_log
      )`
    ).run(proposal);

    return proposal;
  }

  it("calculates metrics with success rates", () => {
    const analytics = createCommandAnalytics(db);

    // Insert test data: 8 completed, 2 failed
    for (let i = 0; i < 8; i++) {
      insertTestProposal({ status: "COMPLETED" });
    }
    for (let i = 0; i < 2; i++) {
      insertTestProposal({ status: "FAILED" });
    }

    const startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();

    const metrics = analytics.getMetrics(startTime, endTime);

    expect(metrics.totalCommands).toBe(10);
    expect(metrics.completedCount).toBe(8);
    expect(metrics.failedCount).toBe(2);
    expect(metrics.successRate).toBe(0.8);
    expect(metrics.failureRate).toBe(0.2);
  });

  it("calculates latency percentiles", () => {
    const analytics = createCommandAnalytics(db);

    // Insert proposals with varying durations
    insertTestProposal({ execution_duration_ms: 100 });
    insertTestProposal({ execution_duration_ms: 200 });
    insertTestProposal({ execution_duration_ms: 300 });
    insertTestProposal({ execution_duration_ms: 400 });
    insertTestProposal({ execution_duration_ms: 500 });
    insertTestProposal({ execution_duration_ms: 1000 });
    insertTestProposal({ execution_duration_ms: 2000 });
    insertTestProposal({ execution_duration_ms: 3000 });
    insertTestProposal({ execution_duration_ms: 4000 });
    insertTestProposal({ execution_duration_ms: 5000 });

    const startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();

    const metrics = analytics.getMetrics(startTime, endTime);

    expect(metrics.avgExecutionDurationMs).toBeGreaterThan(0);
    expect(metrics.p50ExecutionDurationMs).toBeDefined();
    expect(metrics.p95ExecutionDurationMs).toBeDefined();
    expect(metrics.maxExecutionDurationMs).toBe(5000);
  });

  it("groups metrics by command type", () => {
    const analytics = createCommandAnalytics(db);

    // Insert different command types
    insertTestProposal({ command_type: "SET_POWER", status: "COMPLETED" });
    insertTestProposal({ command_type: "SET_POWER", status: "COMPLETED" });
    insertTestProposal({ command_type: "SET_FAN", status: "COMPLETED" });
    insertTestProposal({ command_type: "SET_FAN", status: "FAILED" });

    const startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();

    const metrics = analytics.getMetrics(startTime, endTime);

    expect(metrics.byCommandType.SET_POWER).toBeDefined();
    expect(metrics.byCommandType.SET_POWER.count).toBe(2);
    expect(metrics.byCommandType.SET_POWER.successRate).toBe(1.0);

    expect(metrics.byCommandType.SET_FAN).toBeDefined();
    expect(metrics.byCommandType.SET_FAN.count).toBe(2);
    expect(metrics.byCommandType.SET_FAN.successRate).toBe(0.5);
  });

  it("generates timeseries metrics", () => {
    const analytics = createCommandAnalytics(db);

    const baseTime = Date.now() - 30 * 60 * 1000; // 30 minutes ago

    // Insert proposals at different times
    insertTestProposal({
      created_at: new Date(baseTime).toISOString(),
      status: "COMPLETED",
    });
    insertTestProposal({
      created_at: new Date(baseTime + 10 * 60 * 1000).toISOString(),
      status: "COMPLETED",
    });
    insertTestProposal({
      created_at: new Date(baseTime + 10 * 60 * 1000).toISOString(),
      status: "FAILED",
    });
    insertTestProposal({
      created_at: new Date(baseTime + 20 * 60 * 1000).toISOString(),
      status: "COMPLETED",
    });

    const startTime = new Date(baseTime).toISOString();
    const endTime = new Date().toISOString();

    const timeseries = analytics.getTimeseriesMetrics(
      "command_count",
      startTime,
      endTime,
      600 // 10-minute buckets
    );

    expect(timeseries.metric).toBe("command_count");
    expect(timeseries.dataPoints.length).toBeGreaterThan(0);
    expect(timeseries.dataPoints[0].value).toBeGreaterThanOrEqual(0);
  });

  it("generates alerts for high failure rate", () => {
    const analytics = createCommandAnalytics(db);

    const now = Date.now();
    const last1Hour = now - 60 * 60 * 1000;

    // Insert high failure rate in last hour (30% failure)
    for (let i = 0; i < 7; i++) {
      insertTestProposal({
        created_at: new Date(last1Hour + i * 1000).toISOString(),
        status: "COMPLETED",
      });
    }
    for (let i = 0; i < 3; i++) {
      insertTestProposal({
        created_at: new Date(last1Hour + (i + 7) * 1000).toISOString(),
        status: "FAILED",
      });
    }

    const alerts = analytics.getAlerts();

    const highFailureAlert = alerts.find(
      (a) => a.alertType === "HIGH_FAILURE_RATE"
    );
    expect(highFailureAlert).toBeDefined();
    expect(highFailureAlert?.severity).toBe("WARNING");
  });

  it("generates summary with all sections", () => {
    const analytics = createCommandAnalytics(db);

    // Insert varied data
    insertTestProposal({ status: "PENDING_APPROVAL" });
    insertTestProposal({ status: "EXECUTING" });
    insertTestProposal({ status: "COMPLETED" });
    insertTestProposal({ status: "FAILED" });

    const summary = analytics.getSummary();

    expect(summary.pendingApprovals).toBeGreaterThanOrEqual(0);
    expect(summary.activeExecutions).toBeGreaterThanOrEqual(0);
    expect(summary.last24Hours).toBeDefined();
    expect(summary.last7Days).toBeDefined();
    expect(summary.topCommandTypes).toBeDefined();
    expect(summary.generatedAt).toBeDefined();
  });

  it("handles empty dataset gracefully", () => {
    const analytics = createCommandAnalytics(db);

    const startTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const endTime = new Date().toISOString();

    const metrics = analytics.getMetrics(startTime, endTime);

    expect(metrics.totalCommands).toBe(0);
    expect(metrics.successRate).toBe(0);
    expect(metrics.failureRate).toBe(0);
  });
});
