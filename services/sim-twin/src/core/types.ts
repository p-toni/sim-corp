import { z } from "zod";

export const SimRoastRequestSchema = z.object({
  machineId: z.string().default("SIM-MACHINE"),
  batchSizeKg: z.number().positive().default(5),
  chargeTempC: z.number().default(180),
  targetFirstCrackSeconds: z.number().positive().default(480),
  targetDropSeconds: z.number().positive().default(600),
  maxTempC: z.number().positive().default(220),
  sampleIntervalSeconds: z.number().positive().default(2),
  noiseStdDev: z.number().min(0).default(0.5),
  seed: z.number().int().optional(),
  ambientTempC: z.number().default(25)
});

export type SimRoastRequest = z.infer<typeof SimRoastRequestSchema>;
