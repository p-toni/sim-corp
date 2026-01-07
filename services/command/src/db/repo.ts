import type Database from "better-sqlite3";
import {
  CommandProposalSchema,
  type CommandProposal,
  type RoasterCommand,
  type CommandExecutionResult,
  type Actor,
  type CommandRejectionReason,
} from "@sim-corp/schemas";

// Audit log entry type (inline from schema)
interface AuditLogEntry {
  timestamp: string;
  event: string;
  actor?: Actor;
  details?: Record<string, unknown>;
}

export interface FindAllOptions {
  status?: string;
  machineId?: string;
  sessionId?: string;
  commandType?: string;
  limit?: number;
  offset?: number;
}

export interface CommandProposalRepository {
  create(proposal: CommandProposal): void;
  findById(proposalId: string): CommandProposal | undefined;
  findAll(options?: FindAllOptions): CommandProposal[];
  findByStatus(status: string): CommandProposal[];
  findByMachine(machineId: string): CommandProposal[];
  findBySession(sessionId: string): CommandProposal[];
  findPendingApprovals(): CommandProposal[];
  updateStatus(proposalId: string, status: string): void;
  approve(proposalId: string, approvedBy: Actor): void;
  reject(
    proposalId: string,
    rejectedBy: Actor,
    reason: CommandRejectionReason
  ): void;
  markExecutionStarted(proposalId: string): void;
  markExecutionCompleted(
    proposalId: string,
    outcome: CommandExecutionResult
  ): void;
  addAuditEntry(proposalId: string, entry: AuditLogEntry): void;
}

export function createCommandProposalRepository(
  db: Database.Database
): CommandProposalRepository {
  return {
    create(proposal: CommandProposal): void {
      const stmt = db.prepare(`
        INSERT INTO command_proposals (
          proposal_id, command_id, command_type, machine_id, site_id, org_id,
          target_value, target_unit, constraints, metadata,
          proposed_by, proposed_by_actor, agent_name, agent_version, reasoning,
          session_id, mission_id, status, created_at, approval_required,
          approval_timeout_seconds, audit_log
        ) VALUES (
          @proposalId, @commandId, @commandType, @machineId, @siteId, @orgId,
          @targetValue, @targetUnit, @constraints, @metadata,
          @proposedBy, @proposedByActor, @agentName, @agentVersion, @reasoning,
          @sessionId, @missionId, @status, @createdAt, @approvalRequired,
          @approvalTimeoutSeconds, @auditLog
        )
      `);

      const command = proposal.command;
      stmt.run({
        proposalId: proposal.proposalId,
        commandId: command.commandId,
        commandType: command.commandType,
        machineId: command.machineId,
        siteId: command.siteId ?? null,
        orgId: command.orgId ?? null,
        targetValue: command.targetValue ?? null,
        targetUnit: command.targetUnit ?? null,
        constraints: JSON.stringify(command.constraints),
        metadata: command.metadata ? JSON.stringify(command.metadata) : null,
        proposedBy: proposal.proposedBy,
        proposedByActor: proposal.proposedByActor
          ? JSON.stringify(proposal.proposedByActor)
          : null,
        agentName: proposal.agentName ?? null,
        agentVersion: proposal.agentVersion ?? null,
        reasoning: proposal.reasoning,
        sessionId: proposal.sessionId ?? null,
        missionId: proposal.missionId ?? null,
        status: proposal.status,
        createdAt: proposal.createdAt,
        approvalRequired: proposal.approvalRequired ? 1 : 0,
        approvalTimeoutSeconds: proposal.approvalTimeoutSeconds,
        auditLog: JSON.stringify(proposal.auditLog),
      });
    },

    findById(proposalId: string): CommandProposal | undefined {
      const stmt = db.prepare(
        "SELECT * FROM command_proposals WHERE proposal_id = ?"
      );
      const row = stmt.get(proposalId) as any;
      return row ? rowToProposal(row) : undefined;
    },

    findAll(options: FindAllOptions = {}): CommandProposal[] {
      const conditions: string[] = [];
      const params: any[] = [];

      if (options.status) {
        conditions.push("status = ?");
        params.push(options.status);
      }

      if (options.machineId) {
        conditions.push("machine_id = ?");
        params.push(options.machineId);
      }

      if (options.sessionId) {
        conditions.push("session_id = ?");
        params.push(options.sessionId);
      }

      if (options.commandType) {
        conditions.push("command_type = ?");
        params.push(options.commandType);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limitClause = options.limit ? `LIMIT ${options.limit}` : "";
      const offsetClause = options.offset ? `OFFSET ${options.offset}` : "";

      const query = `
        SELECT * FROM command_proposals
        ${whereClause}
        ORDER BY created_at DESC
        ${limitClause} ${offsetClause}
      `;

      const stmt = db.prepare(query);
      const rows = stmt.all(...params) as any[];
      return rows.map(rowToProposal);
    },

    findByStatus(status: string): CommandProposal[] {
      const stmt = db.prepare(
        "SELECT * FROM command_proposals WHERE status = ? ORDER BY created_at DESC"
      );
      const rows = stmt.all(status) as any[];
      return rows.map(rowToProposal);
    },

    findByMachine(machineId: string): CommandProposal[] {
      const stmt = db.prepare(
        "SELECT * FROM command_proposals WHERE machine_id = ? ORDER BY created_at DESC"
      );
      const rows = stmt.all(machineId) as any[];
      return rows.map(rowToProposal);
    },

    findBySession(sessionId: string): CommandProposal[] {
      const stmt = db.prepare(
        "SELECT * FROM command_proposals WHERE session_id = ? ORDER BY created_at DESC"
      );
      const rows = stmt.all(sessionId) as any[];
      return rows.map(rowToProposal);
    },

    findPendingApprovals(): CommandProposal[] {
      const stmt = db.prepare(
        "SELECT * FROM command_proposals WHERE status = 'PENDING_APPROVAL' ORDER BY created_at ASC"
      );
      const rows = stmt.all() as any[];
      return rows.map(rowToProposal);
    },

    updateStatus(proposalId: string, status: string): void {
      const stmt = db.prepare(`
        UPDATE command_proposals
        SET status = ?
        WHERE proposal_id = ?
      `);
      stmt.run(status, proposalId);
    },

    approve(proposalId: string, approvedBy: Actor): void {
      const now = new Date().toISOString();
      const stmt = db.prepare(`
        UPDATE command_proposals
        SET status = 'APPROVED',
            approved_by = ?,
            approved_at = ?
        WHERE proposal_id = ?
      `);
      stmt.run(JSON.stringify(approvedBy), now, proposalId);
    },

    reject(
      proposalId: string,
      rejectedBy: Actor,
      reason: CommandRejectionReason
    ): void {
      const now = new Date().toISOString();
      const stmt = db.prepare(`
        UPDATE command_proposals
        SET status = 'REJECTED',
            rejected_by = ?,
            rejected_at = ?,
            rejection_reason = ?
        WHERE proposal_id = ?
      `);
      stmt.run(
        JSON.stringify(rejectedBy),
        now,
        JSON.stringify(reason),
        proposalId
      );
    },

    markExecutionStarted(proposalId: string): void {
      const now = new Date().toISOString();
      const stmt = db.prepare(`
        UPDATE command_proposals
        SET status = 'EXECUTING',
            execution_started_at = ?
        WHERE proposal_id = ?
      `);
      stmt.run(now, proposalId);
    },

    markExecutionCompleted(
      proposalId: string,
      outcome: CommandExecutionResult
    ): void {
      const now = new Date().toISOString();
      const proposal = this.findById(proposalId);
      if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
      }

      const executionStartedAt = proposal.executionStartedAt;
      let durationMs: number | null = null;
      if (executionStartedAt) {
        durationMs =
          new Date(now).getTime() - new Date(executionStartedAt).getTime();
      }

      const finalStatus =
        outcome.status === "ACCEPTED" || outcome.status === "COMPLETED"
          ? "COMPLETED"
          : outcome.status === "ABORTED"
            ? "ABORTED"
            : "FAILED";

      const stmt = db.prepare(`
        UPDATE command_proposals
        SET status = ?,
            execution_completed_at = ?,
            execution_duration_ms = ?,
            outcome = ?
        WHERE proposal_id = ?
      `);
      stmt.run(
        finalStatus,
        now,
        durationMs,
        JSON.stringify(outcome),
        proposalId
      );
    },

    addAuditEntry(proposalId: string, entry: AuditLogEntry): void {
      const proposal = this.findById(proposalId);
      if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
      }

      const auditLog = [...proposal.auditLog, entry];
      const stmt = db.prepare(`
        UPDATE command_proposals
        SET audit_log = ?
        WHERE proposal_id = ?
      `);
      stmt.run(JSON.stringify(auditLog), proposalId);
    },
  };
}

function rowToProposal(row: any): CommandProposal {
  const command: RoasterCommand = {
    commandId: row.command_id,
    commandType: row.command_type,
    machineId: row.machine_id,
    siteId: row.site_id || undefined,
    orgId: row.org_id || undefined,
    targetValue: row.target_value ?? undefined,
    targetUnit: row.target_unit || undefined,
    constraints: row.constraints ? JSON.parse(row.constraints) : {},
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    timestamp: row.created_at,
  };

  const proposal: CommandProposal = {
    proposalId: row.proposal_id,
    command,
    proposedBy: row.proposed_by,
    proposedByActor: row.proposed_by_actor
      ? JSON.parse(row.proposed_by_actor)
      : undefined,
    agentName: row.agent_name || undefined,
    agentVersion: row.agent_version || undefined,
    reasoning: row.reasoning,
    sessionId: row.session_id || undefined,
    missionId: row.mission_id || undefined,
    status: row.status,
    createdAt: row.created_at,
    approvalRequired: row.approval_required === 1,
    approvalTimeoutSeconds: row.approval_timeout_seconds,
    approvedBy: row.approved_by ? JSON.parse(row.approved_by) : undefined,
    approvedAt: row.approved_at || undefined,
    rejectedBy: row.rejected_by ? JSON.parse(row.rejected_by) : undefined,
    rejectedAt: row.rejected_at || undefined,
    rejectionReason: row.rejection_reason
      ? JSON.parse(row.rejection_reason)
      : undefined,
    executionStartedAt: row.execution_started_at || undefined,
    executionCompletedAt: row.execution_completed_at || undefined,
    executionDurationMs: row.execution_duration_ms ?? undefined,
    outcome: row.outcome ? JSON.parse(row.outcome) : undefined,
    auditLog: row.audit_log ? JSON.parse(row.audit_log) : [],
  };

  return CommandProposalSchema.parse(proposal);
}
