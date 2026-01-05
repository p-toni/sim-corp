import { z } from "zod";
import {
  IdentifierSchema,
  IsoDateTimeSchema,
  NonEmptyStringSchema,
  NonNegativeNumberSchema,
  BoundedPercentageSchema,
  JsonRecordSchema
} from "../common/scalars";
import { ActorSchema } from "../common/actor";

/**
 * Command Types
 *
 * Defines the types of commands that can be sent to roaster hardware.
 * Each command type has vendor-specific implementations.
 */
export const CommandTypeSchema = z.enum([
  "SET_POWER",      // Set power/heat level (0-100%)
  "SET_FAN",        // Set fan speed (vendor-specific range, e.g., 1-10)
  "SET_DRUM",       // Set drum RPM (vendor-specific range)
  "ABORT",          // Emergency abort - return to safe state
  "PREHEAT",        // Initiate preheat sequence
  "CHARGE",         // Signal charge event (if hardware-controlled)
  "DROP",           // Signal drop/eject
]);

export type CommandType = z.infer<typeof CommandTypeSchema>;

/**
 * Command Status
 *
 * Tracks the lifecycle of a command from proposal through completion.
 */
export const CommandStatusSchema = z.enum([
  "PROPOSED",           // Initial state, command created
  "PENDING_APPROVAL",   // Awaiting operator approval
  "APPROVED",           // Approved by operator, ready to execute
  "REJECTED",           // Rejected by operator or validator
  "EXECUTING",          // Currently being executed
  "COMPLETED",          // Successfully completed
  "FAILED",             // Failed during execution
  "ABORTED",            // Aborted by operator or system
  "TIMEOUT",            // Approval timeout expired
]);

export type CommandStatus = z.infer<typeof CommandStatusSchema>;

/**
 * Command Constraints
 *
 * Safety constraints enforced at validation and execution time.
 */
export const CommandConstraintsSchema = z.object({
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  rampRate: z.number().optional(),        // Max change per second
  requireStates: z.array(z.string()).default([]),  // Required roaster states
  forbiddenStates: z.array(z.string()).default([]), // Forbidden roaster states
  minIntervalSeconds: z.number().optional(), // Min time since last command of this type
  maxDailyCount: z.number().optional(),     // Max executions per day
});

export type CommandConstraints = z.infer<typeof CommandConstraintsSchema>;

/**
 * Roaster Command
 *
 * Core command structure sent to roaster hardware.
 */
export const RoasterCommandSchema = z.object({
  commandId: IdentifierSchema,
  commandType: CommandTypeSchema,
  machineId: IdentifierSchema,
  siteId: IdentifierSchema.optional(),
  orgId: IdentifierSchema.optional(),
  targetValue: z.number().optional(),      // Target value for SET_* commands
  targetUnit: NonEmptyStringSchema.optional(), // Unit of measurement (%, RPM, etc.)
  constraints: CommandConstraintsSchema.default({}),
  metadata: JsonRecordSchema.default({}),
  timestamp: IsoDateTimeSchema,
});

export type RoasterCommand = z.infer<typeof RoasterCommandSchema>;

/**
 * Command Rejection Reason
 *
 * Structured reason for command rejection.
 */
export const CommandRejectionReasonSchema = z.object({
  code: NonEmptyStringSchema,
  message: NonEmptyStringSchema,
  details: JsonRecordSchema.default({}),
});

export type CommandRejectionReason = z.infer<typeof CommandRejectionReasonSchema>;

/**
 * Command Proposal
 *
 * Complete command lifecycle tracking from proposal through outcome.
 */
export const CommandProposalSchema = z.object({
  proposalId: IdentifierSchema,
  command: RoasterCommandSchema,

  // Proposal metadata
  proposedBy: z.enum(["AGENT", "HUMAN"]),
  proposedByActor: ActorSchema.optional(),
  agentName: NonEmptyStringSchema.optional(),
  agentVersion: NonEmptyStringSchema.optional(),
  reasoning: NonEmptyStringSchema,          // Explainable AI - why this command
  sessionId: IdentifierSchema.optional(),   // Associated roast session
  missionId: IdentifierSchema.optional(),   // Associated mission (if agent-proposed)

  // Lifecycle tracking
  status: CommandStatusSchema,
  createdAt: IsoDateTimeSchema,

  // Approval metadata
  approvalRequired: z.boolean().default(true),
  approvalTimeoutSeconds: NonNegativeNumberSchema.default(300), // 5 minutes
  approvedBy: ActorSchema.optional(),
  approvedAt: IsoDateTimeSchema.optional(),
  rejectedBy: ActorSchema.optional(),
  rejectedAt: IsoDateTimeSchema.optional(),
  rejectionReason: CommandRejectionReasonSchema.optional(),

  // Execution metadata
  executionStartedAt: IsoDateTimeSchema.optional(),
  executionCompletedAt: IsoDateTimeSchema.optional(),
  executionDurationMs: NonNegativeNumberSchema.optional(),

  // Outcome
  outcome: z.object({
    status: z.enum(["SUCCESS", "FAILURE", "PARTIAL"]).optional(),
    message: z.string().optional(),
    actualValue: z.number().optional(),     // Actual value achieved (may differ from target)
    telemetryChanges: JsonRecordSchema.default({}), // Observed telemetry changes
    errorCode: z.string().optional(),
    errorMessage: z.string().optional(),
    stackTrace: z.string().optional(),
  }).optional(),

  // Audit
  auditLog: z.array(z.object({
    timestamp: IsoDateTimeSchema,
    event: NonEmptyStringSchema,
    actor: ActorSchema.optional(),
    details: JsonRecordSchema.default({}),
  })).default([]),
});

export type CommandProposal = z.infer<typeof CommandProposalSchema>;

/**
 * Command Execution Result
 *
 * Immediate result from driver when executing a command.
 */
export const CommandExecutionResultSchema = z.object({
  commandId: IdentifierSchema,
  status: z.enum(["ACCEPTED", "REJECTED", "FAILED"]),
  message: z.string().optional(),
  executedAt: IsoDateTimeSchema,
  actualValue: z.number().optional(),
  errorCode: z.string().optional(),
  metadata: JsonRecordSchema.default({}),
});

export type CommandExecutionResult = z.infer<typeof CommandExecutionResultSchema>;

/**
 * Command Approval Request
 *
 * Request for operator approval of a command.
 */
export const CommandApprovalRequestSchema = z.object({
  proposalId: IdentifierSchema,
  command: RoasterCommandSchema,
  reasoning: NonEmptyStringSchema,
  proposedBy: z.enum(["AGENT", "HUMAN"]),
  agentName: NonEmptyStringSchema.optional(),
  sessionId: IdentifierSchema.optional(),
  expiresAt: IsoDateTimeSchema,

  // Safety context for operator
  safetyChecks: z.object({
    constraintsValid: z.boolean(),
    stateValid: z.boolean(),
    rateLimitValid: z.boolean(),
    warnings: z.array(z.string()).default([]),
    risks: z.array(z.object({
      level: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
      description: NonEmptyStringSchema,
    })).default([]),
  }).optional(),
});

export type CommandApprovalRequest = z.infer<typeof CommandApprovalRequestSchema>;

/**
 * Command Approval Response
 *
 * Operator's approval or rejection decision.
 */
export const CommandApprovalResponseSchema = z.object({
  proposalId: IdentifierSchema,
  decision: z.enum(["APPROVED", "REJECTED"]),
  actor: ActorSchema,
  timestamp: IsoDateTimeSchema,
  reason: z.string().optional(),
  metadata: JsonRecordSchema.default({}),
});

export type CommandApprovalResponse = z.infer<typeof CommandApprovalResponseSchema>;

/**
 * Command Batch
 *
 * Group of related commands for bulk approval/execution.
 */
export const CommandBatchSchema = z.object({
  batchId: IdentifierSchema,
  title: NonEmptyStringSchema,
  description: z.string().optional(),
  proposals: z.array(CommandProposalSchema),
  batchApprovalRequired: z.boolean().default(true),
  status: z.enum(["PENDING", "APPROVED", "REJECTED", "EXECUTING", "COMPLETED", "FAILED"]),
  createdAt: IsoDateTimeSchema,
  approvedBy: ActorSchema.optional(),
  approvedAt: IsoDateTimeSchema.optional(),
});

export type CommandBatch = z.infer<typeof CommandBatchSchema>;

/**
 * Command Constraints Preset
 *
 * Predefined constraint sets for common command types.
 */
export const CommandConstraintsPresetSchema = z.object({
  presetId: IdentifierSchema,
  name: NonEmptyStringSchema,
  commandType: CommandTypeSchema,
  constraints: CommandConstraintsSchema,
  machineId: IdentifierSchema.optional(),  // Machine-specific preset
  description: z.string().optional(),
});

export type CommandConstraintsPreset = z.infer<typeof CommandConstraintsPresetSchema>;
