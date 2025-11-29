import { z } from "zod";
import {
  IdentifierSchema,
  IsoDateTimeSchema,
  JsonRecordSchema,
  NonEmptyStringSchema
} from "../common/scalars";
import { MissionSignalsSchema } from "./mission-signals";
import { GovernanceDecisionSchema } from "./governance";

export const MissionPrioritySchema = z.enum(["LOW", "MEDIUM", "HIGH"]);
export type MissionPriority = z.infer<typeof MissionPrioritySchema>;

export const MissionGoalSchema = z.object({
  title: NonEmptyStringSchema,
  description: z.string().optional(),
  desiredOutcome: z.string().optional()
});

export type MissionGoal = z.infer<typeof MissionGoalSchema>;

export const MissionConstraintSchema = z.object({
  key: NonEmptyStringSchema,
  description: z.string().optional(),
  enforcedBy: NonEmptyStringSchema.optional()
});

export type MissionConstraint = z.infer<typeof MissionConstraintSchema>;

export const MissionContextSchema = z
  .object({
    orgId: NonEmptyStringSchema.optional(),
    siteId: NonEmptyStringSchema.optional(),
    machineId: NonEmptyStringSchema.optional()
  })
  .catchall(z.unknown())
  .default({});

export const MissionSchema = z.object({
  id: IdentifierSchema.optional(),
  missionId: IdentifierSchema.optional(),
  idempotencyKey: IdentifierSchema.optional(),
  subjectId: z.string().optional(),
  goal: MissionGoalSchema,
  constraints: z.array(MissionConstraintSchema).default([]),
  params: JsonRecordSchema.default({}),
  context: MissionContextSchema.default({}),
  signals: MissionSignalsSchema.optional(),
  governance: GovernanceDecisionSchema.optional(),
  priority: MissionPrioritySchema.default("MEDIUM"),
  maxAttempts: z.number().int().min(1).optional(),
  requestedBy: IdentifierSchema.optional(),
  createdAt: IsoDateTimeSchema.optional()
});

export type Mission = z.infer<typeof MissionSchema>;
