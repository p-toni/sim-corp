import type { Database } from "@sim-corp/database";
import type { Driver } from "@sim-corp/driver-core";
import {
  type CommandProposal,
  type CommandExecutionResult,
  type Actor,
} from "@sim-corp/schemas";
import { createCommandProposalRepository } from "../db/repo.js";

// Audit log entry type (inline from schema)
interface AuditLogEntry {
  timestamp: string;
  event: string;
  actor?: Actor;
  details?: Record<string, unknown>;
}

export interface CommandExecutor {
  executeApprovedCommand(proposalId: string): Promise<CommandExecutionResult>;
  abortCommand(proposalId: string): Promise<CommandExecutionResult>;
  getExecutionStatus(proposalId: string): Promise<CommandProposal | undefined>;
}

export interface CommandExecutorOptions {
  db: Database;
  getDriver: (machineId: string) => Promise<Driver>;
}

export function createCommandExecutor(
  options: CommandExecutorOptions
): CommandExecutor {
  const repo = createCommandProposalRepository(options.db);

  return {
    async executeApprovedCommand(
      proposalId: string
    ): Promise<CommandExecutionResult> {
      const proposal = await repo.findById(proposalId);
      if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
      }

      if (proposal.status !== "APPROVED") {
        throw new Error(
          `Proposal ${proposalId} is not approved (status: ${proposal.status})`
        );
      }

      // Get driver for this machine
      const driver = await options.getDriver(proposal.command.machineId);

      // Check if driver supports write commands
      if (!driver.writeCommand) {
        const result: CommandExecutionResult = {
          commandId: proposal.command.commandId,
          status: "FAILED",
          message: "Driver does not support write commands",
          executedAt: new Date().toISOString(),
          errorCode: "UNSUPPORTED_OPERATION",
        };

        await repo.markExecutionCompleted(proposalId, result);
        await addAuditEntry(repo, proposalId, "EXECUTION_FAILED", {
          error: "Driver does not support write commands",
        });

        return result;
      }

      // Mark execution started
      await repo.markExecutionStarted(proposalId);
      await addAuditEntry(repo, proposalId, "EXECUTION_STARTED", {});

      try {
        // Execute command via driver
        const result = await driver.writeCommand(proposal.command);

        // Mark execution completed
        await repo.markExecutionCompleted(proposalId, result);
        await addAuditEntry(repo, proposalId, "EXECUTION_COMPLETED", {
          result,
        });

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const result: CommandExecutionResult = {
          commandId: proposal.command.commandId,
          status: "FAILED",
          message: `Execution failed: ${errorMessage}`,
          executedAt: new Date().toISOString(),
          errorCode: "EXECUTION_ERROR",
        };

        await repo.markExecutionCompleted(proposalId, result);
        await addAuditEntry(repo, proposalId, "EXECUTION_FAILED", {
          error: errorMessage,
        });

        return result;
      }
    },

    async abortCommand(proposalId: string): Promise<CommandExecutionResult> {
      const proposal = await repo.findById(proposalId);
      if (!proposal) {
        throw new Error(`Proposal ${proposalId} not found`);
      }

      if (proposal.status !== "EXECUTING") {
        throw new Error(
          `Proposal ${proposalId} is not executing (status: ${proposal.status})`
        );
      }

      // Get driver for this machine
      const driver = await options.getDriver(proposal.command.machineId);

      // Check if driver supports abort
      if (!driver.abortCommand) {
        const result: CommandExecutionResult = {
          commandId: proposal.command.commandId,
          status: "FAILED",
          message: "Driver does not support abort",
          executedAt: new Date().toISOString(),
          errorCode: "UNSUPPORTED_OPERATION",
        };

        await addAuditEntry(repo, proposalId, "ABORT_FAILED", {
          error: "Driver does not support abort",
        });

        return result;
      }

      try {
        // Abort command via driver
        const result = await driver.abortCommand(proposal.command.commandId);

        // Update proposal status
        await repo.markExecutionCompleted(proposalId, result);
        await addAuditEntry(repo, proposalId, "ABORTED", { result });

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const result: CommandExecutionResult = {
          commandId: proposal.command.commandId,
          status: "FAILED",
          message: `Abort failed: ${errorMessage}`,
          executedAt: new Date().toISOString(),
          errorCode: "ABORT_ERROR",
        };

        await addAuditEntry(repo, proposalId, "ABORT_FAILED", {
          error: errorMessage,
        });

        return result;
      }
    },

    async getExecutionStatus(proposalId: string): Promise<CommandProposal | undefined> {
      return await repo.findById(proposalId);
    },
  };
}

async function addAuditEntry(
  repo: ReturnType<typeof createCommandProposalRepository>,
  proposalId: string,
  eventName: string,
  details: Record<string, any>
): Promise<void> {
  const entry: AuditLogEntry = {
    timestamp: new Date().toISOString(),
    event: eventName,
    actor: {
      kind: "SYSTEM",
      id: "command-executor",
      display: "Command Executor",
    },
    details,
  };
  await repo.addAuditEntry(proposalId, entry);
}
