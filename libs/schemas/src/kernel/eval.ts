import { z } from "zod";
import {
  IdentifierSchema,
  IsoDateTimeSchema,
  JsonRecordSchema,
  NonEmptyStringSchema,
  NonNegativeNumberSchema
} from "../common/scalars";

export const EvalMetricSchema = z.object({
  name: NonEmptyStringSchema,
  value: z.number(),
  unit: NonEmptyStringSchema.optional(),
  target: z.number().optional()
});

export type EvalMetric = z.infer<typeof EvalMetricSchema>;

export const GoldenCaseSchema = z.object({
  id: IdentifierSchema,
  name: NonEmptyStringSchema,
  description: z.string().optional(),

  // Bean & batch metadata
  origin: z.string().optional(),
  processingMethod: z.string().optional(),
  variety: z.string().optional(),
  cropYear: z.string().optional(),

  // Machine & setup
  machineId: IdentifierSchema,
  batchSizeKg: z.number().positive().optional(),
  chargeTempC: z.number().optional(),

  // Target outcomes
  targetFirstCrackSeconds: NonNegativeNumberSchema.optional(),
  targetDropSeconds: NonNegativeNumberSchema.optional(),
  targetDevelopmentPercentage: z.number().min(0).max(100).optional(),
  targetFCTempC: z.number().optional(),
  targetDropTempC: z.number().optional(),
  targetRoastColor: z.string().optional(),

  // Tolerances for pass/fail determination
  fcSecondsErrorTolerance: NonNegativeNumberSchema.optional(),
  dropSecondsErrorTolerance: NonNegativeNumberSchema.optional(),
  devPercentageErrorTolerance: NonNegativeNumberSchema.optional(),
  maxRorSpikes: z.number().int().nonnegative().optional(),
  maxRorCrashes: z.number().int().nonnegative().optional(),

  // Sensory
  sensoryRange: z
    .object({
      minScore: z.number().min(0).max(100).optional(),
      notes: z.array(z.string()).default([])
    })
    .optional(),

  // Command tracking (baseline commands for comparison)
  baselineCommands: z.array(z.object({
    commandType: z.string(),
    targetValue: z.number().optional(),
    timestampSeconds: z.number(),
    reasoning: z.string().optional()
  })).default([]),

  // T-028.2: Multiple trials support
  trialsRequired: z.number().int().min(1).default(1), // How many trials to run for consistency testing
  passAtKThreshold: z.number().min(0).max(1).optional(), // e.g., 0.7 = 7/10 trials must pass

  // T-028.2: Negative test cases (agent should reject)
  expectation: z.enum(["SHOULD_SUCCEED", "SHOULD_REJECT"]).default("SHOULD_SUCCEED"),
  rejectReasonExpected: z.string().optional(), // Why agent should reject this case
  dangerLevel: z.enum(["SAFE", "CAUTION", "DANGER"]).default("SAFE"), // Safety classification

  // Reference solution (proof of solvability)
  referenceSolution: z.object({
    sessionId: z.string(),
    roasterName: z.string().optional(),
    achievedAt: IsoDateTimeSchema,
    notes: z.string().optional(),
    expertReviewed: z.boolean().default(false)
  }).optional(),

  // Source tracking (real vs synthetic)
  sourceType: z.enum(["SYNTHETIC", "REAL_SUCCESS", "REAL_FAILURE"]).default("SYNTHETIC"),
  sourceSessionId: z.string().optional(),
  failureMode: z.string().optional(), // What went wrong in original session?

  // Metadata
  createdAt: IsoDateTimeSchema.optional(),
  createdBy: z.string().optional(),
  tags: z.array(z.string()).default([]),
  archived: z.boolean().default(false),
  metadata: JsonRecordSchema.optional()
});

export type GoldenCase = z.infer<typeof GoldenCaseSchema>;

export const EvalOutcomeSchema = z.enum(["PASS", "WARN", "FAIL", "NEEDS_REVIEW"]);
export type EvalOutcome = z.infer<typeof EvalOutcomeSchema>;

/**
 * Detailed metrics calculated during evaluation
 */
export const DetailedEvalMetricsSchema = z.object({
  // Timing errors
  fcSecondsError: NonNegativeNumberSchema.optional(),
  dropSecondsError: NonNegativeNumberSchema.optional(),
  developmentRatioError: NonNegativeNumberSchema.optional(),

  // Temperature metrics
  fcTempError: z.number().optional(),
  dropTempError: z.number().optional(),

  // RoR stability
  rorSpikes: z.number().int().nonnegative().optional(),
  rorCrashes: z.number().int().nonnegative().optional(),
  rorStdDev: NonNegativeNumberSchema.optional(),

  // Variance vs baseline
  timingVariance: NonNegativeNumberSchema.optional(),
  tempVariance: NonNegativeNumberSchema.optional(),

  // Sensory (if available)
  cuppingScore: z.number().min(0).max(100).optional(),
  cuppingScoreDelta: z.number().optional(),

  // Command performance metrics
  commandsProposed: z.number().int().nonnegative().optional(),
  commandsApproved: z.number().int().nonnegative().optional(),
  commandsExecuted: z.number().int().nonnegative().optional(),
  commandsFailed: z.number().int().nonnegative().optional(),
  commandSuccessRate: z.number().min(0).max(1).optional(),
  commandsDeviation: z.number().int().nonnegative().optional(), // deviation from baseline commands
  commandImpactScore: z.number().optional(), // positive = improvement, negative = regression
});

export type DetailedEvalMetrics = z.infer<typeof DetailedEvalMetricsSchema>;

/**
 * LM-based judging scores for plan quality, safety, and physics
 */
export const LMJudgeScoreSchema = z.object({
  // Overall scores (0-100)
  planClarity: z.number().min(0).max(100),
  physicsPlausibility: z.number().min(0).max(100),
  constraintRespect: z.number().min(0).max(100),
  safetyScore: z.number().min(0).max(100),

  // Detected issues
  safetyWarnings: z.array(z.string()).default([]),
  physicsViolations: z.array(z.string()).default([]),
  constraintViolations: z.array(z.string()).default([]),

  // LM metadata
  modelId: z.string(),
  evaluatedAt: IsoDateTimeSchema,
  reasoning: z.string().optional(),
});

export type LMJudgeScore = z.infer<typeof LMJudgeScoreSchema>;

export const EvalRunSchema = z.object({
  id: IdentifierSchema,
  sessionId: IdentifierSchema.optional(),
  missionId: IdentifierSchema.optional(),
  goldenCaseId: IdentifierSchema.optional(),
  runAt: IsoDateTimeSchema,
  evaluatorId: IdentifierSchema.optional(),

  // T-028.2: Trial tracking for consistency measurement
  trialNumber: z.number().int().min(1).optional(), // Which trial is this? (1-indexed)
  trialSetId: z.string().optional(), // Groups trials together
  totalTrials: z.number().int().min(1).optional(), // How many trials in this set?

  // Outcome and gates
  outcome: EvalOutcomeSchema,
  passedGates: z.array(z.string()).default([]),
  failedGates: z.array(z.string()).default([]),

  // T-028.2: Rejection tracking (for negative test cases)
  agentRejected: z.boolean().default(false), // Did agent refuse the mission?
  rejectionReason: z.string().optional(), // Agent's stated reason
  rejectionAppropriate: z.boolean().optional(), // Was rejection correct?

  // Detailed metrics
  detailedMetrics: DetailedEvalMetricsSchema.optional(),

  // Legacy metrics array (for backwards compatibility)
  metrics: z.array(EvalMetricSchema).default([]),

  // LM judging (optional)
  lmJudge: LMJudgeScoreSchema.optional(),

  // Human review
  humanReviewed: z.boolean().default(false),
  humanOutcome: EvalOutcomeSchema.optional(),
  humanNotes: z.string().optional(),
  reviewedBy: z.string().optional(),
  reviewedAt: IsoDateTimeSchema.optional(),

  // Command tracking (commands executed during this eval run)
  commands: z.array(z.object({
    proposalId: z.string(),
    commandType: z.string(),
    targetValue: z.number().optional(),
    proposedAt: IsoDateTimeSchema,
    approvedAt: IsoDateTimeSchema.optional(),
    executedAt: IsoDateTimeSchema.optional(),
    status: z.string(),
    reasoning: z.string().optional(),
    outcome: z.string().optional() // "SUCCESS", "FAILED", "ABORTED"
  })).default([]),

  // Metadata
  orgId: z.string().optional(),
  notes: z.string().optional(),
  artifacts: z.array(NonEmptyStringSchema).default([])
});

export type EvalRun = z.infer<typeof EvalRunSchema>;

/**
 * T-028.2: Trial set summary for pass@k and pass^k metrics
 * Aggregates results from multiple trials of the same golden case
 */
export const TrialSetSummarySchema = z.object({
  trialSetId: IdentifierSchema,
  goldenCaseId: IdentifierSchema,
  sessionId: IdentifierSchema.optional(),
  evaluatedAt: IsoDateTimeSchema,

  // Trial statistics
  totalTrials: z.number().int().min(1),
  passedTrials: z.number().int().nonnegative(),
  failedTrials: z.number().int().nonnegative(),
  warnTrials: z.number().int().nonnegative(),

  // Consistency metrics (Anthropic article)
  passAtK: z.number().min(0).max(1), // Likelihood of ≥1 success in k attempts
  passToK: z.number().min(0).max(1), // Probability all k trials succeed (pass^k)

  // Overall verdict
  consistencyVerdict: z.enum(["CONSISTENT_PASS", "CONSISTENT_FAIL", "FLAKY"]),
  meetsThreshold: z.boolean(), // Does passAtK meet goldenCase.passAtKThreshold?

  // Individual trial IDs
  trialRunIds: z.array(z.string()).default([]),

  // Aggregated metrics (averages across trials)
  avgFcSecondsError: z.number().optional(),
  avgDropSecondsError: z.number().optional(),
  avgRorStdDev: z.number().optional(),

  // Metadata
  orgId: z.string().optional(),
  notes: z.string().optional(),
});

export type TrialSetSummary = z.infer<typeof TrialSetSummarySchema>;
