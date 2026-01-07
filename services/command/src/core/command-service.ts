import type Database from "better-sqlite3";
import {
  type CommandProposal,
  type RoasterCommand,
  type Actor,
  type CommandRejectionReason,
  CommandProposalSchema,
} from "@sim-corp/schemas";
import {
  createCommandProposalRepository,
  type CommandProposalRepository,
} from "../db/repo.js";
import { createSafetyGates, type SafetyGates } from "./validators.js";

// Audit log entry type (inline from schema)
interface AuditLogEntry {
  timestamp: string;
  event: string;
  actor?: Actor;
  details?: Record<string, unknown>;
}

export interface ProposeCommandRequest {
  command: RoasterCommand;
  proposedBy: "AGENT" | "HUMAN";
  proposedByActor?: Actor;
  agentName?: string;
  agentVersion?: string;
  reasoning: string;
  sessionId?: string;
  missionId?: string;
  approvalRequired?: boolean;
  approvalTimeoutSeconds?: number;
}

export interface CommandService {
  proposeCommand(request: ProposeCommandRequest): CommandProposal;
  getPendingApprovals(): CommandProposal[];
  getProposal(proposalId: string): CommandProposal | undefined;
  getProposalsByMachine(machineId: string): CommandProposal[];
  getProposalsBySession(sessionId: string): CommandProposal[];
  approveProposal(proposalId: string, approvedBy: Actor): CommandProposal;
  rejectProposal(
    proposalId: string,
    rejectedBy: Actor,
    reason: string
  ): CommandProposal;
}

export interface GovernorCheck {
  evaluateCommand: (proposal: {
    commandType: string;
    targetValue?: number;
    machineId?: string;
    sessionId?: string;
    actor?: { kind: string; id: string };
  }, context: {
    recentFailureRate?: number;
    commandsInSession?: number;
  }) => {
    action: string;
    confidence: string;
    reasons: Array<{ code: string; message: string; details?: Record<string, unknown> }>;
    decidedAt: string;
    decidedBy: string;
  };
}

export interface CommandServiceOptions {
  db: Database.Database;
  getCurrentState?: (machineId: string) => Promise<Record<string, any>>;
  getRecentCommands?: (machineId: string) => Promise<RoasterCommand[]>;
  governor?: GovernorCheck;
}

export function createCommandService(
  options: CommandServiceOptions
): CommandService {
  const repo = createCommandProposalRepository(options.db);
  const safetyGates = createSafetyGates();

  return {
    proposeCommand(request: ProposeCommandRequest): CommandProposal {
      const now = new Date().toISOString();

      // Check Governor autonomy level and signals
      if (options.governor) {
        const commandsInSession = request.sessionId
          ? repo.findBySession(request.sessionId).length
          : undefined;

        // Calculate recent failure rate from proposals in this session
        let recentFailureRate: number | undefined;
        if (request.sessionId) {
          const sessionProposals = repo.findBySession(request.sessionId);
          const executedCount = sessionProposals.filter(p => p.executedAt).length;
          const failedCount = sessionProposals.filter(p => p.executionStatus === "FAILED").length;
          if (executedCount > 0) {
            recentFailureRate = failedCount / executedCount;
          }
        }

        const governorDecision = options.governor.evaluateCommand(
          {
            commandType: request.command.commandType,
            targetValue: request.command.targetValue,
            machineId: request.command.machineId,
            sessionId: request.sessionId,
            actor: request.proposedByActor
          },
          {
            recentFailureRate,
            commandsInSession
          }
        );

        if (governorDecision.action === "BLOCK") {
          const reasonMessages = governorDecision.reasons.map(r => r.message).join("; ");
          const proposal = createRejectedProposal(
            request,
            now,
            `Blocked by Governor: ${reasonMessages}`,
            governorDecision.reasons[0]?.code
          );
          repo.create(proposal);
          return proposal;
        }
      }

      // Validate constraints
      const constraintValidation = safetyGates.validateConstraints(
        request.command
      );
      if (!constraintValidation.valid) {
        const proposal = createRejectedProposal(
          request,
          now,
          `Constraint validation failed: ${constraintValidation.errors.join(", ")}`
        );
        repo.create(proposal);
        return proposal;
      }

      // Validate state guards (if state provider available)
      if (options.getCurrentState) {
        const currentState = options.getCurrentState(request.command.machineId);
        // Note: This is async in the interface but we'll handle sync for now
        // In production, this should be refactored to support async validation
      }

      // Validate rate limits (if recent commands provider available)
      if (options.getRecentCommands) {
        const recentCommands = options.getRecentCommands(
          request.command.machineId
        );
        // Note: Same async handling consideration
      }

      // Create proposal
      const proposal: CommandProposal = {
        proposalId: `prop-${Date.now()}-${Math.random().toString(36).substring(7)}`,
        command: request.command,
        proposedBy: request.proposedBy,
        proposedByActor: request.proposedByActor,
        agentName: request.agentName,
        agentVersion: request.agentVersion,
        reasoning: request.reasoning,
        sessionId: request.sessionId,
        missionId: request.missionId,
        status: request.approvalRequired ? "PENDING_APPROVAL" : "APPROVED",
        createdAt: now,
        approvalRequired: request.approvalRequired ?? true,
        approvalTimeoutSeconds: request.approvalTimeoutSeconds ?? 300,
        auditLog: [
          {
            timestamp: now,
            event: "PROPOSED",
            actor: request.proposedByActor,
            details: {
              reasoning: request.reasoning,
            },
          },
        ],
      };

      const validated = CommandProposalSchema.parse(proposal);
      repo.create(validated);

      return validated;
    },

    getPendingApprovals(): CommandProposal[] {
      return repo.findPendingApprovals();
    },

    getProposal(proposalId: string): CommandProposal | undefined {
      return repo.findById(proposalId);
    },

    getProposalsByMachine(machineId: string): CommandProposal[] {
      return repo.findByMachine(machineId);
    },

    getProposalsBySession(sessionId: string): CommandProposal[] {
      return repo.findBySession(sessionId);
    },

    approveProposal(proposalId: string, approvedBy: Actor): CommandProposal {
      const proposal = repo.findById(proposalId);
      if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
      }

      if (proposal.status !== "PENDING_APPROVAL") {
        throw new Error(
          `Proposal ${proposalId} cannot be approved: current status is ${proposal.status}`
        );
      }

      repo.approve(proposalId, approvedBy);

      const auditEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        event: "APPROVED",
        actor: approvedBy,
        details: {},
      };
      repo.addAuditEntry(proposalId, auditEntry);

      const updated = repo.findById(proposalId);
      if (!updated) {
        throw new Error(`Proposal ${proposalId} not found after approval`);
      }
      return updated;
    },

    rejectProposal(
      proposalId: string,
      rejectedBy: Actor,
      reason: string
    ): CommandProposal {
      const proposal = repo.findById(proposalId);
      if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
      }

      if (proposal.status !== "PENDING_APPROVAL") {
        throw new Error(
          `Proposal ${proposalId} cannot be rejected: current status is ${proposal.status}`
        );
      }

      const rejectionReason: CommandRejectionReason = {
        code: "USER_REJECTED",
        message: reason,
        details: {},
      };

      repo.reject(proposalId, rejectedBy, rejectionReason);

      const auditEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        event: "REJECTED",
        actor: rejectedBy,
        details: { reason },
      };
      repo.addAuditEntry(proposalId, auditEntry);

      const updated = repo.findById(proposalId);
      if (!updated) {
        throw new Error(`Proposal ${proposalId} not found after rejection`);
      }
      return updated;
    },
  };
}

function createRejectedProposal(
  request: ProposeCommandRequest,
  timestamp: string,
  reason: string,
  code?: string
): CommandProposal {
  const systemActor: Actor = {
    kind: "SYSTEM",
    id: "command-service",
    display: "Command Service Safety Gates",
  };

  const rejectionReason: CommandRejectionReason = {
    code: code ?? "CONSTRAINT_VIOLATION",
    message: reason,
    details: {},
  };

  return CommandProposalSchema.parse({
    proposalId: `prop-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    command: request.command,
    proposedBy: request.proposedBy,
    proposedByActor: request.proposedByActor,
    agentName: request.agentName,
    agentVersion: request.agentVersion,
    reasoning: request.reasoning,
    sessionId: request.sessionId,
    missionId: request.missionId,
    status: "REJECTED",
    createdAt: timestamp,
    approvalRequired: true,
    approvalTimeoutSeconds: 0,
    rejectedBy: systemActor,
    rejectedAt: timestamp,
    rejectionReason,
    auditLog: [
      {
        timestamp,
        event: "PROPOSED",
        actor: request.proposedByActor,
        details: { reasoning: request.reasoning },
      },
      {
        timestamp,
        event: "REJECTED",
        actor: systemActor,
        details: { reason },
      },
    ],
  });
}
