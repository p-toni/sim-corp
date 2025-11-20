import { z } from "zod";
import {
  IdentifierSchema,
  IsoDateTimeSchema,
  JsonRecordSchema,
  NonEmptyStringSchema,
  NonNegativeNumberSchema
} from "../common/scalars";
import { MissionSchema } from "./mission";

export const AgentLoopStepSchema = z.enum(["GET", "SCAN", "THINK", "ACT", "OBSERVE"]);
export type AgentLoopStep = z.infer<typeof AgentLoopStepSchema>;

export const ToolCallSchema = z.object({
  toolName: NonEmptyStringSchema,
  action: NonEmptyStringSchema.optional(),
  input: JsonRecordSchema.optional(),
  output: JsonRecordSchema.optional(),
  durationMs: NonNegativeNumberSchema.optional(),
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
  step: AgentLoopStepSchema,
  status: z.enum(["SUCCESS", "ERROR", "SKIPPED", "CANCELLED"]).default("SUCCESS"),
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.optional(),
  toolCalls: z.array(ToolCallSchema).default([]),
  metrics: z.array(AgentLoopMetricSchema).default([]),
  notes: z.string().optional()
});

export type AgentTraceEntry = z.infer<typeof AgentTraceEntrySchema>;

export const AgentTraceSchema = z.object({
  traceId: IdentifierSchema,
  agentId: IdentifierSchema,
  mission: MissionSchema,
  entries: z.array(AgentTraceEntrySchema),
  metadata: JsonRecordSchema.optional()
});

export type AgentTrace = z.infer<typeof AgentTraceSchema>;
