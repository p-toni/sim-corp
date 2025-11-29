import { z } from "zod";

export const GovernanceDecisionSchema = z.object({
  action: z.enum(["ALLOW", "QUARANTINE", "BLOCK", "RETRY_LATER"]),
  confidence: z.enum(["LOW", "MED", "HIGH"]).default("LOW"),
  reasons: z
    .array(
      z.object({
        code: z.string(),
        message: z.string(),
        details: z.record(z.unknown()).default({})
      })
    )
    .default([]),
  decidedAt: z.string(),
  decidedBy: z.enum(["KERNEL_GOVERNOR", "HUMAN"]).default("KERNEL_GOVERNOR")
});

export type GovernanceDecision = z.infer<typeof GovernanceDecisionSchema>;
