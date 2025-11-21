import { z } from "zod";
import {
  IdentifierSchema,
  IsoDateTimeSchema,
  JsonRecordSchema,
  NonEmptyStringSchema,
  NonNegativeNumberSchema
} from "../common/scalars";
import { MissionSchema } from "./mission";

export const AgentLoopStepSchema = z.enum([
  "GET",
  "GET_MISSION",
  "SCAN",
  "THINK",
  "ACT",
  "OBSERVE"
]);
export type AgentLoopStep = z.infer<typeof AgentLoopStepSchema>;

export const ToolCallSchema = z.object({
  toolName: NonEmptyStringSchema,
  action: NonEmptyStringSchema.optional(),
  input: JsonRecordSchema.optional(),
  output: JsonRecordSchema.optional(),
  durationMs: NonNegativeNumberSchema.optional(),
  deniedByPolicy: z.boolean().optional(),
  error: z
    .object({
      message: NonEmptyStringSchema,
      code: NonEmptyStringSchema.optional()
    })
    .optional()
});

export type ToolCall = z.infer<typeof ToolCallSchema>;

export const AgentLoopMetricSchema = z.object({
  name: NonEmptyStringSchema,
  value: z.number(),
  unit: NonEmptyStringSchema.optional()
});

export type AgentLoopMetric = z.infer<typeof AgentLoopMetricSchema>;

export const AgentTraceEntrySchema = z.object({
  missionId: IdentifierSchema,
  loopId: IdentifierSchema,
  spanId: IdentifierSchema.optional(),
  iteration: NonNegativeNumberSchema.optional(),
  step: AgentLoopStepSchema,
  status: z.enum(["SUCCESS", "ERROR", "SKIPPED", "CANCELLED"]).default("SUCCESS"),
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.optional(),
  error: z
    .object({
      message: NonEmptyStringSchema,
      stack: z.string().optional()
    })
    .optional(),
  toolCalls: z.array(ToolCallSchema).default([]),
  metrics: z.array(AgentLoopMetricSchema).default([]),
  notes: z.string().optional()
});

export type AgentTraceEntry = z.infer<typeof AgentTraceEntrySchema>;
export type AgentTraceStep = AgentTraceEntry;

export const AgentTraceSchema = z.object({
  traceId: IdentifierSchema,
  agentId: IdentifierSchema,
  missionId: IdentifierSchema,
  mission: MissionSchema,
  status: z.enum(["SUCCESS", "ERROR", "ABORTED", "TIMEOUT", "MAX_ITERATIONS"]).default("SUCCESS"),
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.optional(),
  error: z
    .object({
      message: NonEmptyStringSchema,
      stack: z.string().optional()
    })
    .optional(),
  entries: z.array(AgentTraceEntrySchema),
  metadata: JsonRecordSchema.optional()
});

export type AgentTrace = z.infer<typeof AgentTraceSchema>;

export const AgentCardSchema = z.object({
  id: IdentifierSchema,
  name: NonEmptyStringSchema,
  role: NonEmptyStringSchema,
  version: NonEmptyStringSchema,
  description: z.string().optional(),
  capabilities: z.array(NonEmptyStringSchema).default([]),
  tags: z.array(NonEmptyStringSchema).default([]),
  metadata: JsonRecordSchema.optional() // TODO(@human): clarify agent metadata structure.
});

export type AgentCard = z.infer<typeof AgentCardSchema>;
