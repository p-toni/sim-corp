import { z } from "zod";
import { RoastEventSchema, TelemetryPointSchema } from "../domain/roaster";
import { VerificationStatusSchema } from "./verification";

export const TelemetryRecordSchema = TelemetryPointSchema.extend({
  kid: z.string().optional(),
  sig: z.string().optional(),
  verification: VerificationStatusSchema.optional()
});

export type TelemetryRecord = z.infer<typeof TelemetryRecordSchema>;

export const RoastEventRecordSchema = RoastEventSchema.extend({
  kid: z.string().optional(),
  sig: z.string().optional(),
  verification: VerificationStatusSchema.optional()
});

export type RoastEventRecord = z.infer<typeof RoastEventRecordSchema>;
