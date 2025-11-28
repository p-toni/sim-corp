import { z } from "zod";
import {
  IdentifierSchema,
  IsoDateTimeSchema,
  JsonRecordSchema,
  NonEmptyStringSchema
} from "../common/scalars";

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

export const MissionSchema = z.object({
  id: IdentifierSchema.optional(),
  missionId: IdentifierSchema.optional(),
  goal: MissionGoalSchema,
  constraints: z.array(MissionConstraintSchema).default([]),
  params: JsonRecordSchema.default({}),
  context: JsonRecordSchema.default({}),
  priority: MissionPrioritySchema.default("MEDIUM"),
  requestedBy: IdentifierSchema.optional(),
  createdAt: IsoDateTimeSchema.optional()
});

export type Mission = z.infer<typeof MissionSchema>;
