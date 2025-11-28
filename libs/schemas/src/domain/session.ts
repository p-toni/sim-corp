import { z } from "zod";
import { TelemetryOriginSchema } from "../kernel/telemetry-envelope";

export const RoastSessionSummarySchema = TelemetryOriginSchema.extend({
  sessionId: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  status: z.enum(["ACTIVE", "CLOSED"]),
  durationSeconds: z.number().nonnegative().optional(),
  fcSeconds: z.number().nonnegative().optional(),
  dropSeconds: z.number().nonnegative().optional(),
  maxBtC: z.number().optional()
});

export type RoastSessionSummary = z.infer<typeof RoastSessionSummarySchema>;

export const RoastSessionSchema = RoastSessionSummarySchema.extend({
  meta: z.record(z.unknown()).default({})
});

export type RoastSession = z.infer<typeof RoastSessionSchema>;
