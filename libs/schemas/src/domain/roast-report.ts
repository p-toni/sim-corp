import { z } from "zod";
import { RoastAnalysisSchema } from "./roast-analysis";
import { EventOverrideSchema, SessionMetaSchema, SessionNoteSchema } from "./qc";
import { ActorSchema } from "../common";
import { EvalRunSchema } from "../kernel/eval";

export const TrustMetricsSchema = z.object({
  totalPoints: z.number(),
  verifiedPoints: z.number(),
  unsignedPoints: z.number(),
  failedPoints: z.number(),
  verificationRate: z.number(),
  deviceIds: z.array(z.string()).default([])
});

export type TrustMetrics = z.infer<typeof TrustMetricsSchema>;

export const RoastReportSchema = z.object({
  reportId: z.string(),
  sessionId: z.string(),
  reportKind: z.string().default("POST_ROAST_V1"),
  orgId: z.string(),
  siteId: z.string(),
  machineId: z.string(),
  createdAt: z.string(),
  createdBy: z.enum(["AGENT", "HUMAN"]).default("AGENT"),
  actor: ActorSchema.optional(),
  agentName: z.string().optional(),
  agentVersion: z.string().optional(),
  analysis: RoastAnalysisSchema,
  meta: SessionMetaSchema.optional(),
  overrides: z.array(EventOverrideSchema).default([]),
  notes: z.array(SessionNoteSchema).default([]),
  markdown: z.string(),
  trustMetrics: TrustMetricsSchema.optional(),
  evaluations: z.array(EvalRunSchema).default([]),
  nextActions: z
    .array(
      z.object({
        code: z.string(),
        message: z.string(),
        confidence: z.enum(["LOW", "MED", "HIGH"]).default("LOW"),
        details: z.record(z.unknown()).default({})
      })
    )
    .default([])
});

export type RoastReport = z.infer<typeof RoastReportSchema>;
