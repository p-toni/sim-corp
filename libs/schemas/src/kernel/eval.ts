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

  // Outcome and gates
  outcome: EvalOutcomeSchema,
  passedGates: z.array(z.string()).default([]),
  failedGates: z.array(z.string()).default([]),

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

  // Metadata
  orgId: z.string().optional(),
  notes: z.string().optional(),
  artifacts: z.array(NonEmptyStringSchema).default([])
});

export type EvalRun = z.infer<typeof EvalRunSchema>;
