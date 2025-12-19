import { z } from "zod";
import { IsoDateTimeSchema } from "../common/scalars";
import { RoastEventSchema, TelemetryPointSchema } from "../domain/roaster";
import { VerificationStatusSchema } from "./verification";

export const TelemetryOriginSchema = z.object({
  orgId: z.string(),
  siteId: z.string(),
  machineId: z.string()
});

export const TelemetryTopicSchema = z.enum(["telemetry", "event"]);

export const TelemetryEnvelopeSchema = z.object({
  ts: IsoDateTimeSchema,
  origin: TelemetryOriginSchema,
  topic: TelemetryTopicSchema,
  payload: z.union([TelemetryPointSchema, RoastEventSchema]),
  sessionId: z.string().optional(),
  sig: z.string().optional(),
  kid: z.string().optional(),
  verification: VerificationStatusSchema.optional()
});

export type TelemetryOrigin = z.infer<typeof TelemetryOriginSchema>;
export type TelemetryTopic = z.infer<typeof TelemetryTopicSchema>;
export type TelemetryEnvelope = z.infer<typeof TelemetryEnvelopeSchema>;
