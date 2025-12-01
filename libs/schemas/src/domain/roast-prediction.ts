import { z } from "zod";
import { IdentifierSchema, IsoDateTimeSchema } from "../common/scalars";

export const RoastPredictionPhaseSchema = z.enum([
  "PREHEAT",
  "DRYING",
  "MAILLARD",
  "DEVELOPMENT",
  "POST_DROP",
  "UNKNOWN"
]);

export const RoastPredictionSuggestionSchema = z.object({
  kind: z.string(),
  title: z.string(),
  detail: z.string(),
  severity: z.enum(["INFO", "WARN"]),
  requiresApproval: z.literal(false)
});

export const RoastPredictionSchema = z.object({
  sessionId: IdentifierSchema,
  atTs: IsoDateTimeSchema,
  phase: RoastPredictionPhaseSchema,
  inputs: z.object({
    pointsUsed: z.number().int().nonnegative(),
    channelsAvailable: z.array(z.string()),
    profileId: IdentifierSchema.optional(),
    profileVersion: z.number().int().optional()
  }),
  etaSeconds: z.object({
    toFC: z.number().nonnegative().optional(),
    toDrop: z.number().nonnegative().optional()
  }),
  predictedTimes: z.object({
    fcAtElapsedSeconds: z.number().nonnegative().optional(),
    dropAtElapsedSeconds: z.number().nonnegative().optional()
  }),
  predictedDevRatio: z.number().min(0).max(1).optional(),
  confidence: z.object({
    overall: z.number().min(0).max(1),
    components: z.object({
      dataQuality: z.number().min(0).max(1),
      modelFit: z.number().min(0).max(1),
      phaseFit: z.number().min(0).max(1),
      profileFit: z.number().min(0).max(1).optional()
    }),
    reasons: z.array(z.string())
  }),
  suggestions: RoastPredictionSuggestionSchema.array(),
  explain: z.object({
    method: z.literal("HEURISTIC_V1"),
    features: z.record(z.union([z.number(), z.string(), z.boolean()])),
    lastObserved: z.object({
      elapsedSeconds: z.number().nonnegative(),
      btC: z.number().optional(),
      rorCPerMin: z.number().optional()
    })
  })
});

export type RoastPrediction = z.infer<typeof RoastPredictionSchema>;
export type RoastPredictionPhase = z.infer<typeof RoastPredictionPhaseSchema>;
export type RoastPredictionSuggestion = z.infer<typeof RoastPredictionSuggestionSchema>;
