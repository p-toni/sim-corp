import type { Database } from "@sim-corp/database";
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
  create(proposal: CommandProposal): Promise<void>;
  findById(proposalId: string): Promise<CommandProposal | undefined>;
  findAll(options?: FindAllOptions): Promise<CommandProposal[]>;
  findByStatus(status: string): Promise<CommandProposal[]>;
  findByMachine(machineId: string): Promise<CommandProposal[]>;
  findBySession(sessionId: string): Promise<CommandProposal[]>;
  findPendingApprovals(): Promise<CommandProposal[]>;
  updateStatus(proposalId: string, status: string): Promise<void>;
  approve(proposalId: string, approvedBy: Actor): Promise<void>;
  reject(
    proposalId: string,
    rejectedBy: Actor,
    reason: CommandRejectionReason
  ): Promise<void>;
  markExecutionStarted(proposalId: string): Promise<void>;
  markExecutionCompleted(
    proposalId: string,
    outcome: CommandExecutionResult
  ): Promise<void>;
  addAuditEntry(proposalId: string, entry: AuditLogEntry): Promise<void>;
}

export function createCommandProposalRepository(
  db: Database
): CommandProposalRepository {
  return {
    async create(proposal: CommandProposal): Promise<void> {
      const command = proposal.command;
      await db.exec(`
        INSERT INTO command_proposals (
          proposal_id, command_id, command_type, machine_id, site_id, org_id,
          target_value, target_unit, constraints, metadata,
          proposed_by, proposed_by_actor, agent_name, agent_version, reasoning,
          session_id, mission_id, status, created_at, approval_required,
          approval_timeout_seconds, audit_log
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        proposal.proposalId,
        command.commandId,
        command.commandType,
        command.machineId,
        command.siteId ?? null,
        command.orgId ?? null,
        command.targetValue ?? null,
        command.targetUnit ?? null,
        JSON.stringify(command.constraints),
        command.metadata ? JSON.stringify(command.metadata) : null,
        proposal.proposedBy,
        proposal.proposedByActor ? JSON.stringify(proposal.proposedByActor) : null,
        proposal.agentName ?? null,
        proposal.agentVersion ?? null,
        proposal.reasoning,
        proposal.sessionId ?? null,
        proposal.missionId ?? null,
        proposal.status,
        proposal.createdAt,
        proposal.approvalRequired ? 1 : 0,
        proposal.approvalTimeoutSeconds,
        JSON.stringify(proposal.auditLog),
      ]);
    },

    async findById(proposalId: string): Promise<CommandProposal | undefined> {
      const result = await db.query(
        "SELECT * FROM command_proposals WHERE proposal_id = ?",
        [proposalId]
      );
      return result.rows.length > 0 ? rowToProposal(result.rows[0]) : undefined;
    },

    async findAll(options: FindAllOptions = {}): Promise<CommandProposal[]> {
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

      const result = await db.query(query, params);
      return result.rows.map(rowToProposal);
    },

    async findByStatus(status: string): Promise<CommandProposal[]> {
      const result = await db.query(
        "SELECT * FROM command_proposals WHERE status = ? ORDER BY created_at DESC",
        [status]
      );
      return result.rows.map(rowToProposal);
    },

    async findByMachine(machineId: string): Promise<CommandProposal[]> {
      const result = await db.query(
        "SELECT * FROM command_proposals WHERE machine_id = ? ORDER BY created_at DESC",
        [machineId]
      );
      return result.rows.map(rowToProposal);
    },

    async findBySession(sessionId: string): Promise<CommandProposal[]> {
      const result = await db.query(
        "SELECT * FROM command_proposals WHERE session_id = ? ORDER BY created_at DESC",
        [sessionId]
      );
      return result.rows.map(rowToProposal);
    },

    async findPendingApprovals(): Promise<CommandProposal[]> {
      const result = await db.query(
        "SELECT * FROM command_proposals WHERE status = 'PENDING_APPROVAL' ORDER BY created_at ASC",
        []
      );
      return result.rows.map(rowToProposal);
    },

    async updateStatus(proposalId: string, status: string): Promise<void> {
      await db.exec(`
        UPDATE command_proposals
        SET status = ?
        WHERE proposal_id = ?
      `, [status, proposalId]);
    },

    async approve(proposalId: string, approvedBy: Actor): Promise<void> {
      const now = new Date().toISOString();
      await db.exec(`
        UPDATE command_proposals
        SET status = 'APPROVED',
            approved_by = ?,
            approved_at = ?
        WHERE proposal_id = ?
      `, [JSON.stringify(approvedBy), now, proposalId]);
    },

    async reject(
      proposalId: string,
      rejectedBy: Actor,
      reason: CommandRejectionReason
    ): Promise<void> {
      const now = new Date().toISOString();
      await db.exec(`
        UPDATE command_proposals
        SET status = 'REJECTED',
            rejected_by = ?,
            rejected_at = ?,
            rejection_reason = ?
        WHERE proposal_id = ?
      `, [
        JSON.stringify(rejectedBy),
        now,
        JSON.stringify(reason),
        proposalId
      ]);
    },

    async markExecutionStarted(proposalId: string): Promise<void> {
      const now = new Date().toISOString();
      await db.exec(`
        UPDATE command_proposals
        SET status = 'EXECUTING',
            execution_started_at = ?
        WHERE proposal_id = ?
      `, [now, proposalId]);
    },

    async markExecutionCompleted(
      proposalId: string,
      outcome: CommandExecutionResult
    ): Promise<void> {
      const now = new Date().toISOString();
      const proposal = await this.findById(proposalId);
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

      await db.exec(`
        UPDATE command_proposals
        SET status = ?,
            execution_completed_at = ?,
            execution_duration_ms = ?,
            outcome = ?
        WHERE proposal_id = ?
      `, [
        finalStatus,
        now,
        durationMs,
        JSON.stringify(outcome),
        proposalId
      ]);
    },

    async addAuditEntry(proposalId: string, entry: AuditLogEntry): Promise<void> {
      const proposal = await this.findById(proposalId);
      if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
      }

      const auditLog = [...proposal.auditLog, entry];
      await db.exec(`
        UPDATE command_proposals
        SET audit_log = ?
        WHERE proposal_id = ?
      `, [JSON.stringify(auditLog), proposalId]);
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
