import type { TelemetryPoint, RoasterCommand, CommandExecutionResult } from "@sim-corp/schemas";

export interface DriverConfig {
  orgId: string;
  siteId: string;
  machineId: string;
  connection: Record<string, unknown>;
}

/**
 * Command Status from Driver Perspective
 *
 * Tracks the immediate state of a command in the driver/hardware.
 */
export interface CommandStatus {
  commandId: string;
  status: "PENDING" | "EXECUTING" | "COMPLETED" | "FAILED" | "ABORTED";
  message?: string;
  progress?: number; // 0-100%
  metadata?: Record<string, unknown>;
}

/**
 * Driver Interface
 *
 * Defines the contract for all roaster drivers.
 *
 * Read-only operations (existing):
 * - connect(): Establish connection to roaster hardware
 * - readTelemetry(): Read current telemetry point
 * - disconnect(): Close connection
 * - getStatus(): Get driver status
 *
 * Write operations (M4 - L3 Autopilot):
 * - writeCommand(): Send command to roaster (requires approval)
 * - abortCommand(): Emergency abort command (no approval required)
 * - getCommandStatus(): Query status of executing command
 */
export interface Driver {
  // Read-only operations (existing)
  connect(): Promise<void>;
  readTelemetry(): Promise<TelemetryPoint>;
  disconnect(): Promise<void>;
  getStatus?(): unknown;

  // Write operations (M4 - L3 Autopilot)
  /**
   * Write command to roaster hardware.
   *
   * This method should:
   * 1. Validate command against hardware capabilities
   * 2. Send command to roaster
   * 3. Return immediate result (ACCEPTED/REJECTED/FAILED)
   *
   * Note: This is called AFTER approval workflow. Driver should NOT
   * implement approval logic - that's handled by command service.
   *
   * @param command - Validated, approved command
   * @returns Immediate execution result
   */
  writeCommand?(command: RoasterCommand): Promise<CommandExecutionResult>;

  /**
   * Abort a command or return roaster to safe state.
   *
   * This is an emergency operation that bypasses normal approval workflow.
   * Should attempt to:
   * 1. Stop any in-progress commands
   * 2. Return roaster to safe state
   * 3. Log abort attempt
   *
   * @param commandId - ID of command to abort, or undefined to abort all
   * @returns Execution result
   */
  abortCommand?(commandId?: string): Promise<CommandExecutionResult>;

  /**
   * Get status of a command being executed by the driver.
   *
   * @param commandId - ID of command to check
   * @returns Current status, or undefined if command not found
   */
  getCommandStatus?(commandId: string): Promise<CommandStatus | undefined>;
}

export type DriverFactory = (cfg: DriverConfig) => Driver;
