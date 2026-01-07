import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { createCommandService } from "../src/core/command-service";
import type { RoasterCommand, Actor } from "@sim-corp/schemas";

describe("CommandService", () => {
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
    `);
  });

  it("proposes a command requiring approval", () => {
    const service = createCommandService({ db });

    const command: RoasterCommand = {
      commandId: "cmd-1",
      commandType: "SET_POWER",
      machineId: "machine-1",
      targetValue: 75,
      targetUnit: "%",
      timestamp: new Date().toISOString(),
      constraints: {},
    };

    const proposal = service.proposeCommand({
      command,
      proposedBy: "AGENT",
      agentName: "roast-agent",
      agentVersion: "1.0.0",
      reasoning: "Need to increase power for development phase",
      approvalRequired: true,
    });

    expect(proposal.proposalId).toBeDefined();
    expect(proposal.status).toBe("PENDING_APPROVAL");
    expect(proposal.command.commandType).toBe("SET_POWER");
    expect(proposal.approvalRequired).toBe(true);
    expect(proposal.auditLog).toHaveLength(1);
    expect(proposal.auditLog[0].event).toBe("PROPOSED");
  });

  it("auto-approves command when approval not required", () => {
    const service = createCommandService({ db });

    const command: RoasterCommand = {
      commandId: "cmd-2",
      commandType: "ABORT",
      machineId: "machine-1",
      timestamp: new Date().toISOString(),
      constraints: {},
    };

    const proposal = service.proposeCommand({
      command,
      proposedBy: "HUMAN",
      reasoning: "Emergency abort",
      approvalRequired: false,
    });

    expect(proposal.status).toBe("APPROVED");
  });

  it("rejects command that violates constraints", () => {
    const service = createCommandService({ db });

    const command: RoasterCommand = {
      commandId: "cmd-3",
      commandType: "SET_POWER",
      machineId: "machine-1",
      targetValue: 150, // Invalid: power must be 0-100
      targetUnit: "%",
      timestamp: new Date().toISOString(),
      constraints: {},
    };

    const proposal = service.proposeCommand({
      command,
      proposedBy: "AGENT",
      reasoning: "Test invalid power",
      approvalRequired: true,
    });

    expect(proposal.status).toBe("REJECTED");
    expect(proposal.rejectionReason?.code).toBe("CONSTRAINT_VIOLATION");
    expect(proposal.rejectionReason?.message).toContain(
      "Constraint validation failed"
    );
  });

  it("approves a pending proposal", () => {
    const service = createCommandService({ db });

    const command: RoasterCommand = {
      commandId: "cmd-4",
      commandType: "SET_FAN",
      machineId: "machine-1",
      targetValue: 5,
      targetUnit: "level",
      timestamp: new Date().toISOString(),
      constraints: {},
    };

    const proposal = service.proposeCommand({
      command,
      proposedBy: "AGENT",
      reasoning: "Increase fan speed",
      approvalRequired: true,
    });

    const approver: Actor = {
      kind: "USER",
      id: "user-1",
      display: "Test User",
    };

    const approved = service.approveProposal(proposal.proposalId, approver);

    expect(approved.status).toBe("APPROVED");
    expect(approved.approvedBy).toEqual(approver);
    expect(approved.approvedAt).toBeDefined();
    expect(approved.auditLog).toHaveLength(2);
    expect(approved.auditLog[1].event).toBe("APPROVED");
  });

  it("rejects a pending proposal", () => {
    const service = createCommandService({ db });

    const command: RoasterCommand = {
      commandId: "cmd-5",
      commandType: "DROP",
      machineId: "machine-1",
      timestamp: new Date().toISOString(),
      constraints: {},
    };

    const proposal = service.proposeCommand({
      command,
      proposedBy: "AGENT",
      reasoning: "Drop beans",
      approvalRequired: true,
    });

    const rejector: Actor = {
      kind: "USER",
      id: "user-1",
      display: "Test User",
    };

    const rejected = service.rejectProposal(
      proposal.proposalId,
      rejector,
      "Not ready to drop yet"
    );

    expect(rejected.status).toBe("REJECTED");
    expect(rejected.rejectedBy).toEqual(rejector);
    expect(rejected.rejectedAt).toBeDefined();
    expect(rejected.rejectionReason?.code).toBe("USER_REJECTED");
    expect(rejected.rejectionReason?.message).toBe("Not ready to drop yet");
    expect(rejected.auditLog).toHaveLength(2);
    expect(rejected.auditLog[1].event).toBe("REJECTED");
  });

  it("retrieves pending approvals", () => {
    const service = createCommandService({ db });

    // Create multiple proposals
    service.proposeCommand({
      command: {
        commandId: "cmd-6",
        commandType: "SET_POWER",
        machineId: "machine-1",
        targetValue: 50,
        targetUnit: "%",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Test 1",
      approvalRequired: true,
    });

    service.proposeCommand({
      command: {
        commandId: "cmd-7",
        commandType: "SET_FAN",
        machineId: "machine-1",
        targetValue: 3,
        targetUnit: "level",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Test 2",
      approvalRequired: true,
    });

    const pending = service.getPendingApprovals();
    expect(pending).toHaveLength(2);
  });

  it("filters proposals by machine", () => {
    const service = createCommandService({ db });

    service.proposeCommand({
      command: {
        commandId: "cmd-8",
        commandType: "SET_POWER",
        machineId: "machine-1",
        targetValue: 50,
        targetUnit: "%",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Machine 1 command",
    });

    service.proposeCommand({
      command: {
        commandId: "cmd-9",
        commandType: "SET_POWER",
        machineId: "machine-2",
        targetValue: 60,
        targetUnit: "%",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Machine 2 command",
    });

    const machine1Proposals = service.getProposalsByMachine("machine-1");
    expect(machine1Proposals).toHaveLength(1);
    expect(machine1Proposals[0].command.machineId).toBe("machine-1");
  });

  it("filters proposals by session", () => {
    const service = createCommandService({ db });

    service.proposeCommand({
      command: {
        commandId: "cmd-10",
        commandType: "SET_POWER",
        machineId: "machine-1",
        targetValue: 50,
        targetUnit: "%",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Session A command",
      sessionId: "session-a",
    });

    service.proposeCommand({
      command: {
        commandId: "cmd-11",
        commandType: "SET_FAN",
        machineId: "machine-1",
        targetValue: 3,
        targetUnit: "level",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Session B command",
      sessionId: "session-b",
    });

    const sessionAProposals = service.getProposalsBySession("session-a");
    expect(sessionAProposals).toHaveLength(1);
    expect(sessionAProposals[0].sessionId).toBe("session-a");
  });

  it("throws error when approving non-pending proposal", () => {
    const service = createCommandService({ db });

    const proposal = service.proposeCommand({
      command: {
        commandId: "cmd-12",
        commandType: "ABORT",
        machineId: "machine-1",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "HUMAN",
      reasoning: "Emergency",
      approvalRequired: false, // Auto-approved
    });

    expect(() =>
      service.approveProposal(proposal.proposalId, {
        type: "HUMAN",
        id: "user-1",
        name: "Test User",
      })
    ).toThrow("cannot be approved");
  });

  it("tracks complete audit log", () => {
    const service = createCommandService({ db });

    const proposal = service.proposeCommand({
      command: {
        commandId: "cmd-13",
        commandType: "SET_DRUM",
        machineId: "machine-1",
        targetValue: 50,
        targetUnit: "RPM",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      agentName: "roast-agent",
      reasoning: "Adjust drum speed",
      approvalRequired: true,
    });

    expect(proposal.auditLog).toHaveLength(1);

    const approved = service.approveProposal(proposal.proposalId, {
      kind: "USER",
      id: "user-1",
      display: "Test User",
    });

    expect(approved.auditLog).toHaveLength(2);
    expect(approved.auditLog[0].event).toBe("PROPOSED");
    expect(approved.auditLog[1].event).toBe("APPROVED");
  });

  it("retrieves all proposals with default options", () => {
    const service = createCommandService({ db });

    service.proposeCommand({
      command: {
        commandId: "cmd-14",
        commandType: "SET_POWER",
        machineId: "machine-1",
        targetValue: 50,
        targetUnit: "%",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Test 1",
    });

    service.proposeCommand({
      command: {
        commandId: "cmd-15",
        commandType: "SET_FAN",
        machineId: "machine-1",
        targetValue: 3,
        targetUnit: "level",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Test 2",
    });

    const allProposals = service.getAllProposals();
    expect(allProposals).toHaveLength(2);
  });

  it("filters getAllProposals by status", () => {
    const service = createCommandService({ db });

    const proposal1 = service.proposeCommand({
      command: {
        commandId: "cmd-16",
        commandType: "SET_POWER",
        machineId: "machine-1",
        targetValue: 50,
        targetUnit: "%",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Test pending",
      approvalRequired: true,
    });

    const proposal2 = service.proposeCommand({
      command: {
        commandId: "cmd-17",
        commandType: "SET_FAN",
        machineId: "machine-1",
        targetValue: 3,
        targetUnit: "level",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Test approved",
      approvalRequired: true,
    });

    service.approveProposal(proposal2.proposalId, {
      kind: "USER",
      id: "user-1",
      display: "Test User",
    });

    const pendingOnly = service.getAllProposals({ status: "PENDING_APPROVAL" });
    expect(pendingOnly).toHaveLength(1);
    expect(pendingOnly[0].proposalId).toBe(proposal1.proposalId);

    const approvedOnly = service.getAllProposals({ status: "APPROVED" });
    expect(approvedOnly).toHaveLength(1);
    expect(approvedOnly[0].proposalId).toBe(proposal2.proposalId);
  });

  it("filters getAllProposals by multiple criteria", () => {
    const service = createCommandService({ db });

    service.proposeCommand({
      command: {
        commandId: "cmd-18",
        commandType: "SET_POWER",
        machineId: "machine-1",
        targetValue: 50,
        targetUnit: "%",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Machine 1, Power",
      sessionId: "session-x",
    });

    service.proposeCommand({
      command: {
        commandId: "cmd-19",
        commandType: "SET_FAN",
        machineId: "machine-1",
        targetValue: 3,
        targetUnit: "level",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Machine 1, Fan",
      sessionId: "session-x",
    });

    service.proposeCommand({
      command: {
        commandId: "cmd-20",
        commandType: "SET_POWER",
        machineId: "machine-2",
        targetValue: 60,
        targetUnit: "%",
        timestamp: new Date().toISOString(),
        constraints: {},
      },
      proposedBy: "AGENT",
      reasoning: "Machine 2, Power",
      sessionId: "session-y",
    });

    const filtered = service.getAllProposals({
      machineId: "machine-1",
      sessionId: "session-x",
      commandType: "SET_POWER",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].command.commandType).toBe("SET_POWER");
    expect(filtered[0].command.machineId).toBe("machine-1");
    expect(filtered[0].sessionId).toBe("session-x");
  });

  it("limits getAllProposals results", () => {
    const service = createCommandService({ db });

    // Create 5 proposals
    for (let i = 0; i < 5; i++) {
      service.proposeCommand({
        command: {
          commandId: `cmd-${21 + i}`,
          commandType: "SET_POWER",
          machineId: "machine-1",
          targetValue: 50 + i,
          targetUnit: "%",
          timestamp: new Date().toISOString(),
          constraints: {},
        },
        proposedBy: "AGENT",
        reasoning: `Test ${i}`,
      });
    }

    const limited = service.getAllProposals({ limit: 3 });
    expect(limited).toHaveLength(3);
  });
});
