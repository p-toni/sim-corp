import { z } from "zod";
import {
  IdentifierSchema,
  IsoDateTimeSchema,
  JsonRecordSchema,
  NonEmptyStringSchema
} from "../common/scalars";

export const PolicyDecisionSchema = z.enum(["ALLOW", "DENY"]);
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const PolicyCheckRequestSchema = z.object({
  requestId: IdentifierSchema.optional(),
  agentId: IdentifierSchema,
  tool: NonEmptyStringSchema,
  action: NonEmptyStringSchema,
  resource: NonEmptyStringSchema,
  missionId: IdentifierSchema.optional(),
  context: JsonRecordSchema.default({}),
  requestedAt: IsoDateTimeSchema.optional()
});

export type PolicyCheckRequest = z.infer<typeof PolicyCheckRequestSchema>;

export const PolicyCheckResultSchema = z.object({
  request: PolicyCheckRequestSchema,
  decision: PolicyDecisionSchema,
  reason: z.string().optional(),
  checkedAt: IsoDateTimeSchema,
  evaluatorId: IdentifierSchema.optional(),
  violations: z.array(z.string()).default([])
});

export type PolicyCheckResult = z.infer<typeof PolicyCheckResultSchema>;
