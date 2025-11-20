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
  machineId: IdentifierSchema,
  batchSizeKg: z.number().positive().optional(),
  targetFirstCrackSeconds: NonNegativeNumberSchema.optional(),
  targetDropSeconds: NonNegativeNumberSchema.optional(),
  targetDevelopmentPercentage: z.number().min(0).max(100).optional(),
  sensoryRange: z
    .object({
      minScore: z.number().min(0).max(100).optional(),
      notes: z.array(z.string()).default([])
    })
    .optional(),
  metadata: JsonRecordSchema.optional()
});

export type GoldenCase = z.infer<typeof GoldenCaseSchema>;

export const EvalOutcomeSchema = z.enum(["PASS", "WARN", "FAIL"]);
export type EvalOutcome = z.infer<typeof EvalOutcomeSchema>;

export const EvalRunSchema = z.object({
  id: IdentifierSchema,
  missionId: IdentifierSchema.optional(),
  goldenCaseId: IdentifierSchema.optional(),
  runAt: IsoDateTimeSchema,
  evaluatorId: IdentifierSchema.optional(),
  outcome: EvalOutcomeSchema,
  metrics: z.array(EvalMetricSchema).default([]),
  notes: z.string().optional(),
  artifacts: z.array(NonEmptyStringSchema).default([])
});

export type EvalRun = z.infer<typeof EvalRunSchema>;
