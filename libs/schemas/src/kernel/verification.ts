import { z } from "zod";

export const VerificationStatusSchema = z.object({
  verified: z.boolean(),
  verifiedBy: z.literal("INGESTION_V1").optional(),
  reason: z.string().optional()
});

export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
