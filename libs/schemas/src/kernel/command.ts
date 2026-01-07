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
 * Propose Command Request
 *
 * Request to propose a new command for approval/execution.
 */
export const ProposeCommandRequestSchema = z.object({
  command: RoasterCommandSchema,
  proposedBy: z.enum(["AGENT", "HUMAN"]).default("HUMAN"),
  proposedByActor: ActorSchema.optional(),
  agentName: NonEmptyStringSchema.optional(),
  agentVersion: NonEmptyStringSchema.optional(),
  reasoning: NonEmptyStringSchema,
  sessionId: IdentifierSchema.optional(),
  missionId: IdentifierSchema.optional(),
  approvalRequired: z.boolean().default(true),
  approvalTimeoutSeconds: NonNegativeNumberSchema.default(300),
});

export type ProposeCommandRequest = z.infer<typeof ProposeCommandRequestSchema>;

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

// ============================================================================
// ANALYTICS & MONITORING
// ============================================================================

/**
 * Command Analytics Metrics
 *
 * Aggregated metrics for command performance monitoring.
 */
export const CommandMetricsSchema = z.object({
  // Time window
  startTime: IsoDateTimeSchema,
  endTime: IsoDateTimeSchema,

  // Counts by status
  totalCommands: NonNegativeNumberSchema,
  proposedCount: NonNegativeNumberSchema.default(0),
  pendingApprovalCount: NonNegativeNumberSchema.default(0),
  approvedCount: NonNegativeNumberSchema.default(0),
  rejectedCount: NonNegativeNumberSchema.default(0),
  executingCount: NonNegativeNumberSchema.default(0),
  completedCount: NonNegativeNumberSchema.default(0),
  failedCount: NonNegativeNumberSchema.default(0),
  abortedCount: NonNegativeNumberSchema.default(0),
  timeoutCount: NonNegativeNumberSchema.default(0),

  // Success metrics (as proportions 0-1)
  successRate: z.number().min(0).max(1),
  failureRate: z.number().min(0).max(1),
  rejectionRate: z.number().min(0).max(1),

  // Latency metrics (in milliseconds)
  avgApprovalLatencyMs: NonNegativeNumberSchema.optional(),
  avgExecutionDurationMs: NonNegativeNumberSchema.optional(),
  p50ExecutionDurationMs: NonNegativeNumberSchema.optional(),
  p95ExecutionDurationMs: NonNegativeNumberSchema.optional(),
  p99ExecutionDurationMs: NonNegativeNumberSchema.optional(),
  maxExecutionDurationMs: NonNegativeNumberSchema.optional(),

  // Command type breakdown
  byCommandType: z.record(CommandTypeSchema, z.object({
    count: NonNegativeNumberSchema,
    successRate: z.number().min(0).max(1),
  })).default({}),

  // Machine breakdown
  byMachine: z.record(IdentifierSchema, z.object({
    count: NonNegativeNumberSchema,
    successRate: z.number().min(0).max(1),
  })).default({}),

  // Safety metrics
  safetyViolations: NonNegativeNumberSchema.default(0),
  constraintViolations: NonNegativeNumberSchema.default(0),
  rateLimitHits: NonNegativeNumberSchema.default(0),
});

export type CommandMetrics = z.infer<typeof CommandMetricsSchema>;

/**
 * Command Timeseries Data Point
 *
 * Single data point in a timeseries metric.
 */
export const CommandTimeseriesDataPointSchema = z.object({
  timestamp: IsoDateTimeSchema,
  value: z.number(),
  metadata: JsonRecordSchema.default({}),
});

export type CommandTimeseriesDataPoint = z.infer<typeof CommandTimeseriesDataPointSchema>;

/**
 * Command Timeseries Metrics
 *
 * Time-bucketed metrics for charting and trend analysis.
 */
export const CommandTimeseriesMetricsSchema = z.object({
  metric: z.enum([
    "command_count",
    "success_rate",
    "failure_rate",
    "avg_execution_duration_ms",
    "avg_approval_latency_ms",
    "safety_violations",
  ]),
  startTime: IsoDateTimeSchema,
  endTime: IsoDateTimeSchema,
  bucketSizeSeconds: NonNegativeNumberSchema,
  dataPoints: z.array(CommandTimeseriesDataPointSchema),
});

export type CommandTimeseriesMetrics = z.infer<typeof CommandTimeseriesMetricsSchema>;

/**
 * Command Alert Severity
 */
export const CommandAlertSeveritySchema = z.enum([
  "INFO",
  "WARNING",
  "ERROR",
  "CRITICAL",
]);

export type CommandAlertSeverity = z.infer<typeof CommandAlertSeveritySchema>;

/**
 * Command Alert
 *
 * Safety violations, anomalies, and operational alerts.
 */
export const CommandAlertSchema = z.object({
  alertId: IdentifierSchema,
  severity: CommandAlertSeveritySchema,
  alertType: z.enum([
    "SAFETY_VIOLATION",
    "CONSTRAINT_VIOLATION",
    "RATE_LIMIT_EXCEEDED",
    "EXECUTION_FAILURE",
    "APPROVAL_TIMEOUT",
    "UNUSUAL_PATTERN",
    "HIGH_FAILURE_RATE",
    "HIGH_LATENCY",
  ]),

  title: NonEmptyStringSchema,
  message: NonEmptyStringSchema,

  // Context
  proposalId: IdentifierSchema.optional(),
  commandType: CommandTypeSchema.optional(),
  machineId: IdentifierSchema.optional(),
  sessionId: IdentifierSchema.optional(),

  // Timing
  timestamp: IsoDateTimeSchema,
  acknowledgedBy: ActorSchema.optional(),
  acknowledgedAt: IsoDateTimeSchema.optional(),
  resolvedAt: IsoDateTimeSchema.optional(),

  // Details
  metadata: JsonRecordSchema.default({}),
});

export type CommandAlert = z.infer<typeof CommandAlertSchema>;

/**
 * Command Summary
 *
 * High-level summary statistics for dashboards.
 */
export const CommandSummarySchema = z.object({
  // Current state
  pendingApprovals: NonNegativeNumberSchema,
  activeExecutions: NonNegativeNumberSchema,
  recentFailures: NonNegativeNumberSchema, // Last hour

  // 24-hour metrics
  last24Hours: CommandMetricsSchema,

  // 7-day metrics
  last7Days: CommandMetricsSchema,

  // Active alerts
  activeAlerts: z.array(CommandAlertSchema),

  // Top command types (by frequency)
  topCommandTypes: z.array(z.object({
    commandType: CommandTypeSchema,
    count: NonNegativeNumberSchema,
    successRate: z.number().min(0).max(1),
  })),

  // Generated at
  generatedAt: IsoDateTimeSchema,
});

export type CommandSummary = z.infer<typeof CommandSummarySchema>;
