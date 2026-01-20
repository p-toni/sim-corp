import type { Database } from "@sim-corp/database";
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
  type FindAllOptions,
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
  proposeCommand(request: ProposeCommandRequest): Promise<CommandProposal>;
  getAllProposals(options?: FindAllOptions): Promise<CommandProposal[]>;
  getPendingApprovals(): Promise<CommandProposal[]>;
  getProposal(proposalId: string): Promise<CommandProposal | undefined>;
  getProposalsByMachine(machineId: string): Promise<CommandProposal[]>;
  getProposalsBySession(sessionId: string): Promise<CommandProposal[]>;
  approveProposal(proposalId: string, approvedBy: Actor): Promise<CommandProposal>;
  rejectProposal(
    proposalId: string,
    rejectedBy: Actor,
    reason: string
  ): Promise<CommandProposal>;
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
  db: Database;
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
    async proposeCommand(request: ProposeCommandRequest): Promise<CommandProposal> {
      const now = new Date().toISOString();

      // Check Governor autonomy level and signals
      if (options.governor) {
        const sessionProposals = request.sessionId
          ? await repo.findBySession(request.sessionId)
          : [];
        const commandsInSession = sessionProposals.length > 0 ? sessionProposals.length : undefined;

        // Calculate recent failure rate from proposals in this session
        let recentFailureRate: number | undefined;
        if (sessionProposals.length > 0) {
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
          await repo.create(proposal);
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
        await repo.create(proposal);
        return proposal;
      }

      // Validate state guards (if state provider available)
      if (options.getCurrentState) {
        const currentState = await options.getCurrentState(request.command.machineId);
        // Note: State validation could be added here
      }

      // Validate rate limits (if recent commands provider available)
      if (options.getRecentCommands) {
        const recentCommands = await options.getRecentCommands(
          request.command.machineId
        );
        // Note: Rate limit validation could be added here
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
      await repo.create(validated);

      return validated;
    },

    async getAllProposals(options?: FindAllOptions): Promise<CommandProposal[]> {
      return await repo.findAll(options);
    },

    async getPendingApprovals(): Promise<CommandProposal[]> {
      return await repo.findPendingApprovals();
    },

    async getProposal(proposalId: string): Promise<CommandProposal | undefined> {
      return await repo.findById(proposalId);
    },

    async getProposalsByMachine(machineId: string): Promise<CommandProposal[]> {
      return await repo.findByMachine(machineId);
    },

    async getProposalsBySession(sessionId: string): Promise<CommandProposal[]> {
      return await repo.findBySession(sessionId);
    },

    async approveProposal(proposalId: string, approvedBy: Actor): Promise<CommandProposal> {
      const proposal = await repo.findById(proposalId);
      if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
      }

      if (proposal.status !== "PENDING_APPROVAL") {
        throw new Error(
          `Proposal ${proposalId} cannot be approved: current status is ${proposal.status}`
        );
      }

      await repo.approve(proposalId, approvedBy);

      const auditEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        event: "APPROVED",
        actor: approvedBy,
        details: {},
      };
      await repo.addAuditEntry(proposalId, auditEntry);

      const updated = await repo.findById(proposalId);
      if (!updated) {
        throw new Error(`Proposal ${proposalId} not found after approval`);
      }
      return updated;
    },

    async rejectProposal(
      proposalId: string,
      rejectedBy: Actor,
      reason: string
    ): Promise<CommandProposal> {
      const proposal = await repo.findById(proposalId);
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

      await repo.reject(proposalId, rejectedBy, rejectionReason);

      const auditEntry: AuditLogEntry = {
        timestamp: new Date().toISOString(),
        event: "REJECTED",
        actor: rejectedBy,
        details: { reason },
      };
      await repo.addAuditEntry(proposalId, auditEntry);

      const updated = await repo.findById(proposalId);
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
