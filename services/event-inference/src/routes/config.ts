import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { InferenceEngine } from "../core/engine";

const ConfigBodySchema = z.object({
  orgId: z.string(),
  siteId: z.string(),
  machineId: z.string(),
  config: z.object({
    sessionGapSeconds: z.number().optional(),
    tpSearchWindowSeconds: z.number().optional(),
    minFirstCrackSeconds: z.number().optional(),
    fcBtThresholdC: z.number().optional(),
    fcRorMaxThreshold: z.number().optional(),
    dropSilenceSeconds: z.number().optional(),
    maxBufferPoints: z.number().optional()
  })
});

interface ConfigDeps {
  engine: InferenceEngine;
}

export function registerConfigRoute(app: FastifyInstance, deps: ConfigDeps): void {
  app.post(
    "/config",
    (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const parsed = ConfigBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid config", issues: parsed.error.issues });
      }
      const { orgId, siteId, machineId, config } = parsed.data;
      const updated = deps.engine.upsertConfig({ orgId, siteId, machineId }, config);
      return updated;
    }
  );
}
