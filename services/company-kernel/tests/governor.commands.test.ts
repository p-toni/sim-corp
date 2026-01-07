import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { GovernorConfigStore } from "../src/core/governor/config";
import { GovernorEngine } from "../src/core/governor/engine";
import { RateLimiter } from "../src/core/governor/rate-limit";

describe("Governor command evaluation", () => {
  let db: Database.Database;
  let configStore: GovernorConfigStore;
  let rateLimiter: RateLimiter;
  let governor: GovernorEngine;

  beforeEach(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS kernel_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS rate_limit_state (
        scope_key TEXT NOT NULL,
        goal TEXT NOT NULL,
        tokens REAL NOT NULL,
        last_updated_at TEXT NOT NULL,
        PRIMARY KEY (scope_key, goal)
      );
    `);

    configStore = new GovernorConfigStore(db);
    rateLimiter = new RateLimiter(db);
    governor = new GovernorEngine(configStore, rateLimiter);
  });

  it("allows commands at L3 autonomy level", () => {
    const decision = governor.evaluateCommand({
      commandType: "SET_POWER",
      targetValue: 85,
      machineId: "mx-1",
      sessionId: "session-1",
      actor: { kind: "AGENT", id: "sim-roast-runner" }
    });

    expect(decision.action).toBe("ALLOW");
    expect(decision.reasons.some(r => r.code === "APPROVAL_REQUIRED")).toBe(true);
  });

  it("blocks agent commands at L2 autonomy level", () => {
    // Set autonomy level to L2
    configStore.setConfig({
      rateLimits: {},
      gates: {},
      commandAutonomy: {
        autonomyLevel: "L2",
        requireApprovalForAll: true,
        commandFailureThreshold: 0.3,
        evaluationWindowMinutes: 60
      },
      policy: { allowedGoals: [] }
    });

    const decision = governor.evaluateCommand({
      commandType: "SET_POWER",
      targetValue: 85,
      machineId: "mx-1",
      sessionId: "session-1",
      actor: { kind: "AGENT", id: "sim-roast-runner" }
    });

    expect(decision.action).toBe("BLOCK");
    expect(decision.reasons.some(r => r.code === "AGENT_COMMANDS_NOT_ALLOWED")).toBe(true);
  });

  it("allows manual commands at L2 autonomy level", () => {
    // Set autonomy level to L2
    configStore.setConfig({
      rateLimits: {},
      gates: {},
      commandAutonomy: {
        autonomyLevel: "L2",
        requireApprovalForAll: true,
        commandFailureThreshold: 0.3,
        evaluationWindowMinutes: 60
      },
      policy: { allowedGoals: [] }
    });

    const decision = governor.evaluateCommand({
      commandType: "SET_POWER",
      targetValue: 85,
      machineId: "mx-1",
      sessionId: "session-1",
      actor: { kind: "USER", id: "operator-1" }
    });

    expect(decision.action).toBe("ALLOW");
    expect(decision.reasons.some(r => r.code === "MANUAL_COMMAND_ALLOWED")).toBe(true);
  });

  it("blocks all commands at L1 autonomy level", () => {
    // Set autonomy level to L1
    configStore.setConfig({
      rateLimits: {},
      gates: {},
      commandAutonomy: {
        autonomyLevel: "L1",
        requireApprovalForAll: true,
        commandFailureThreshold: 0.3,
        evaluationWindowMinutes: 60
      },
      policy: { allowedGoals: [] }
    });

    const decision = governor.evaluateCommand({
      commandType: "SET_POWER",
      targetValue: 85,
      machineId: "mx-1",
      sessionId: "session-1",
      actor: { kind: "AGENT", id: "sim-roast-runner" }
    });

    expect(decision.action).toBe("BLOCK");
    expect(decision.reasons.some(r => r.code === "AUTONOMY_LEVEL_TOO_LOW")).toBe(true);
  });

  it("blocks commands when failure rate exceeds threshold", () => {
    const decision = governor.evaluateCommand(
      {
        commandType: "SET_POWER",
        targetValue: 85,
        machineId: "mx-1",
        sessionId: "session-1",
        actor: { kind: "AGENT", id: "sim-roast-runner" }
      },
      {
        recentFailureRate: 0.5 // 50% failure rate
      }
    );

    expect(decision.action).toBe("BLOCK");
    expect(decision.reasons.some(r => r.code === "HIGH_FAILURE_RATE")).toBe(true);
  });

  it("blocks commands when session command limit is reached", () => {
    // Set max commands per session to 5
    configStore.setConfig({
      rateLimits: {},
      gates: {},
      commandAutonomy: {
        autonomyLevel: "L3",
        requireApprovalForAll: true,
        maxCommandsPerSession: 5,
        commandFailureThreshold: 0.3,
        evaluationWindowMinutes: 60
      },
      policy: { allowedGoals: [] }
    });

    const decision = governor.evaluateCommand(
      {
        commandType: "SET_POWER",
        targetValue: 85,
        machineId: "mx-1",
        sessionId: "session-1",
        actor: { kind: "AGENT", id: "sim-roast-runner" }
      },
      {
        commandsInSession: 5 // already at limit
      }
    );

    expect(decision.action).toBe("BLOCK");
    expect(decision.reasons.some(r => r.code === "SESSION_COMMAND_LIMIT")).toBe(true);
  });
});
