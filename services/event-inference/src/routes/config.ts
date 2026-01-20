import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { InferenceEngine } from "../core/engine";
import { DEFAULT_CONFIG } from "../core/config";

const MachineKeySchema = z.object({
  orgId: z.string(),
  siteId: z.string(),
  machineId: z.string(),
});

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
    maxBufferPoints: z.number().optional(),
  }),
});

interface ConfigDeps {
  engine: InferenceEngine;
}

export function registerConfigRoute(app: FastifyInstance, deps: ConfigDeps): void {
  /**
   * POST /config - Upsert config for a machine (persisted to database)
   */
  app.post("/config", async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    const parsed = ConfigBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid config", issues: parsed.error.issues });
    }
    const { orgId, siteId, machineId, config } = parsed.data;
    const updated = await deps.engine.upsertConfig({ orgId, siteId, machineId }, config);
    return updated;
  });

  /**
   * GET /config - Get config for a machine (returns defaults if not configured)
   */
  app.get(
    "/config",
    async (request: FastifyRequest<{ Querystring: unknown }>, reply: FastifyReply) => {
      const parsed = MachineKeySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Missing required query params: orgId, siteId, machineId",
          issues: parsed.error.issues,
        });
      }
      const { orgId, siteId, machineId } = parsed.data;
      const config = deps.engine.getConfig({ orgId, siteId, machineId });
      return {
        orgId,
        siteId,
        machineId,
        config,
        isDefault: config === DEFAULT_CONFIG,
      };
    }
  );

  /**
   * DELETE /config - Delete config for a machine (reverts to defaults)
   */
  app.delete(
    "/config",
    async (request: FastifyRequest<{ Querystring: unknown }>, reply: FastifyReply) => {
      const parsed = MachineKeySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.status(400).send({
          error: "Missing required query params: orgId, siteId, machineId",
          issues: parsed.error.issues,
        });
      }
      const { orgId, siteId, machineId } = parsed.data;
      const deleted = await deps.engine.deleteConfig({ orgId, siteId, machineId });
      if (!deleted) {
        return reply.status(404).send({ error: "Config not found" });
      }
      return { deleted: true, message: "Config deleted, machine will use defaults" };
    }
  );

  /**
   * GET /config/defaults - Get default config values
   */
  app.get("/config/defaults", async () => {
    return DEFAULT_CONFIG;
  });
}
