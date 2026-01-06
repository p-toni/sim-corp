import type Database from "better-sqlite3";
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
  getExecutionStatus(proposalId: string): CommandProposal | undefined;
}

export interface CommandExecutorOptions {
  db: Database.Database;
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
      const proposal = repo.findById(proposalId);
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

        repo.markExecutionCompleted(proposalId, result);
        addAuditEntry(repo, proposalId, "EXECUTION_FAILED", {
          error: "Driver does not support write commands",
        });

        return result;
      }

      // Mark execution started
      repo.markExecutionStarted(proposalId);
      addAuditEntry(repo, proposalId, "EXECUTION_STARTED", {});

      try {
        // Execute command via driver
        const result = await driver.writeCommand(proposal.command);

        // Mark execution completed
        repo.markExecutionCompleted(proposalId, result);
        addAuditEntry(repo, proposalId, "EXECUTION_COMPLETED", {
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

        repo.markExecutionCompleted(proposalId, result);
        addAuditEntry(repo, proposalId, "EXECUTION_FAILED", {
          error: errorMessage,
        });

        return result;
      }
    },

    async abortCommand(proposalId: string): Promise<CommandExecutionResult> {
      const proposal = repo.findById(proposalId);
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

        addAuditEntry(repo, proposalId, "ABORT_FAILED", {
          error: "Driver does not support abort",
        });

        return result;
      }

      try {
        // Abort command via driver
        const result = await driver.abortCommand(proposal.command.commandId);

        // Update proposal status
        repo.markExecutionCompleted(proposalId, result);
        addAuditEntry(repo, proposalId, "ABORTED", { result });

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

        addAuditEntry(repo, proposalId, "ABORT_FAILED", {
          error: errorMessage,
        });

        return result;
      }
    },

    getExecutionStatus(proposalId: string): CommandProposal | undefined {
      return repo.findById(proposalId);
    },
  };
}

function addAuditEntry(
  repo: ReturnType<typeof createCommandProposalRepository>,
  proposalId: string,
  eventName: string,
  details: Record<string, any>
): void {
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
  repo.addAuditEntry(proposalId, entry);
}
