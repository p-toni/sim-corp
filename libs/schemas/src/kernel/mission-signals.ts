import { z } from "zod";

export const MissionSignalsSchema = z.object({
  session: z
    .object({
      sessionId: z.string().optional(),
      closeReason: z.enum(["DROP", "SILENCE_CLOSE"]).optional(),
      durationSec: z.number().nonnegative().optional(),
      telemetryPoints: z.number().int().nonnegative().optional(),
      hasBT: z.boolean().optional(),
      hasET: z.boolean().optional(),
      lastTelemetryDeltaSec: z.number().nonnegative().optional()
    })
    .default({})
});

export type MissionSignals = z.infer<typeof MissionSignalsSchema>;
