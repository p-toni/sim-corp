import { z } from "zod";

export const TcpLineDriverConfigSchema = z.object({
  host: z.string().default("127.0.0.1"),
  port: z.number().int().positive(),
  format: z.enum(["jsonl", "csv"]).default("jsonl"),
  csv: z
    .object({
      hasHeader: z.boolean().default(false),
      columns: z.array(z.string()).default([]),
      delimiter: z.string().default(",")
    })
    .default({}),
  emitIntervalMs: z.number().int().positive().default(1000),
  dedupeWithinMs: z.number().int().nonnegative().default(200),
  offsets: z
    .object({
      btC: z.number().default(0),
      etC: z.number().default(0)
    })
    .default({ btC: 0, etC: 0 }),
  reconnect: z
    .object({
      enabled: z.boolean().default(true),
      minBackoffMs: z.number().default(250),
      maxBackoffMs: z.number().default(5000)
    })
    .default({ enabled: true, minBackoffMs: 250, maxBackoffMs: 5000 })
});

export type TcpLineDriverConfig = z.infer<typeof TcpLineDriverConfigSchema>;
