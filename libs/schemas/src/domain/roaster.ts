import { z } from "zod";
import {
  BoundedPercentageSchema,
  IdentifierSchema,
  IsoDateTimeSchema,
  JsonRecordSchema,
  NonEmptyStringSchema,
  NonNegativeNumberSchema
} from "../common/scalars";

export const TelemetryPointSchema = z.object({
  ts: IsoDateTimeSchema,
  machineId: IdentifierSchema,
  batchId: IdentifierSchema.optional(),
  elapsedSeconds: NonNegativeNumberSchema,
  btC: z.number().optional(),
  etC: z.number().optional(),
  rorCPerMin: z.number().optional(),
  gasPct: BoundedPercentageSchema.optional(),
  fanPct: BoundedPercentageSchema.optional(),
  drumRpm: z.number().optional(),
  ambientC: z.number().optional()
});

export type TelemetryPoint = z.infer<typeof TelemetryPointSchema>;

export const RoastEventTypeSchema = z.enum([
  "CHARGE",
  "TP",
  "FC",
  "DEVELOPMENT_START",
  "DROP",
  "NOTE"
]);

export type RoastEventType = z.infer<typeof RoastEventTypeSchema>;

export const RoastEventSchema = z.object({
  ts: IsoDateTimeSchema,
  machineId: IdentifierSchema,
  batchId: IdentifierSchema.optional(),
  type: RoastEventTypeSchema,
  payload: JsonRecordSchema.optional()
});

export type RoastEvent = z.infer<typeof RoastEventSchema>;

export const MachineCapabilitiesSchema = z.object({
  readable: z.array(z.string()).default([]),
  writable: z.array(z.string()).default([]),
  limits: z.record(z.string(), z.number()).default({})
});

export type MachineCapabilities = z.infer<typeof MachineCapabilitiesSchema>;

export const MachineSchema = z.object({
  id: IdentifierSchema,
  orgId: IdentifierSchema,
  siteId: IdentifierSchema,
  model: NonEmptyStringSchema,
  manufacturer: NonEmptyStringSchema,
  firmwareVersion: z.string().optional(),
  capabilities: MachineCapabilitiesSchema,
  notes: z.string().optional()
});

export type Machine = z.infer<typeof MachineSchema>;

export const RoastStatusSchema = z.enum([
  "PLANNED",
  "IN_PROGRESS",
  "COMPLETE",
  "ABORTED"
]);

export type RoastStatus = z.infer<typeof RoastStatusSchema>;

export const RoastSchema = z.object({
  id: IdentifierSchema,
  missionId: IdentifierSchema.optional(),
  machineId: IdentifierSchema,
  batchId: IdentifierSchema,
  profileId: IdentifierSchema.optional(),
  startedAt: IsoDateTimeSchema,
  completedAt: IsoDateTimeSchema.optional(),
  status: RoastStatusSchema.default("PLANNED"),
  telemetry: z.array(TelemetryPointSchema),
  events: z.array(RoastEventSchema),
  targets: z
    .object({
      firstCrackSeconds: NonNegativeNumberSchema.optional(),
      dropSeconds: NonNegativeNumberSchema.optional(),
      developmentPercentage: BoundedPercentageSchema.optional()
    })
    .optional()
});

export type Roast = z.infer<typeof RoastSchema>;

export const CuppingSchema = z.object({
  id: IdentifierSchema,
  roastId: IdentifierSchema,
  recordedAt: IsoDateTimeSchema,
  cupperId: IdentifierSchema.optional(),
  score: BoundedPercentageSchema,
  flavorNotes: z.array(z.string()).default([]),
  defects: z.array(z.string()).default([]),
  comments: z.string().optional()
});

export type Cupping = z.infer<typeof CuppingSchema>;
