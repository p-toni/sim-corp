import { z } from "zod";

export const SessionClosedEventSchema = z.object({
  type: z.literal("session.closed"),
  version: z.literal(1),
  emittedAt: z.string(),
  orgId: z.string(),
  siteId: z.string(),
  machineId: z.string(),
  sessionId: z.string(),
  reportKind: z.string().default("POST_ROAST_V1"),
  reason: z.enum(["DROP", "SILENCE_CLOSE"]).optional(),
  dropSeconds: z.number().optional(),
  telemetryPoints: z.number().optional(),
  durationSec: z.number().nonnegative().optional(),
  hasBT: z.boolean().optional(),
  hasET: z.boolean().optional(),
  lastTelemetryDeltaSec: z.number().nonnegative().optional()
});

export type SessionClosedEvent = z.infer<typeof SessionClosedEventSchema>;
