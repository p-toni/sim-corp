import { z } from "zod";

export const RoastPhaseSchema = z.enum(["DRYING", "MAILLARD", "DEVELOPMENT"]);
export type RoastPhase = z.infer<typeof RoastPhaseSchema>;

export const PhaseBoundarySchema = z.object({
  phase: RoastPhaseSchema,
  startSeconds: z.number().nonnegative(),
  endSeconds: z.number().nonnegative()
});
export type PhaseBoundary = z.infer<typeof PhaseBoundarySchema>;

export const AnalysisWarningSchema = z.object({
  code: z.string(),
  severity: z.enum(["INFO", "WARN", "ALERT"]),
  message: z.string(),
  atSeconds: z.number().nonnegative().optional(),
  details: z.record(z.unknown()).default({})
});
export type AnalysisWarning = z.infer<typeof AnalysisWarningSchema>;

export const RecommendationSchema = z.object({
  code: z.string(),
  message: z.string(),
  confidence: z.enum(["LOW", "MED", "HIGH"]).default("LOW"),
  details: z.record(z.unknown()).default({})
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

export const PhaseStatsSchema = z.object({
  phase: RoastPhaseSchema,
  durationSeconds: z.number().nonnegative(),
  btDeltaC: z.number().optional(),
  avgRorCPerMin: z.number().optional(),
  rorSlopeCPerMin2: z.number().optional(),
  rorSmoothnessScore: z.number().min(0).max(1).optional()
});
export type PhaseStats = z.infer<typeof PhaseStatsSchema>;

export const RoastAnalysisSchema = z.object({
  sessionId: z.string(),
  orgId: z.string(),
  siteId: z.string(),
  machineId: z.string(),
  computedAt: z.string(),
  chargeSeconds: z.number().nonnegative().optional(),
  tpSeconds: z.number().nonnegative().optional(),
  fcSeconds: z.number().nonnegative().optional(),
  dropSeconds: z.number().nonnegative().optional(),
  phases: z.array(PhaseBoundarySchema),
  phaseStats: z.array(PhaseStatsSchema),
  totalDurationSeconds: z.number().nonnegative().optional(),
  developmentRatio: z.number().min(0).max(1).optional(),
  maxBtC: z.number().optional(),
  endBtC: z.number().optional(),
  crashFlick: z.object({
    crashDetected: z.boolean(),
    flickDetected: z.boolean(),
    crashAtSeconds: z.number().optional(),
    flickAtSeconds: z.number().optional(),
    details: z.record(z.unknown()).default({})
  }),
  warnings: z.array(AnalysisWarningSchema).default([]),
  recommendations: z.array(RecommendationSchema).default([]),
  config: z.record(z.unknown()).default({})
});

export type RoastAnalysis = z.infer<typeof RoastAnalysisSchema>;
