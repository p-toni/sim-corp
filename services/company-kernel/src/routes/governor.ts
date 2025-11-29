import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { GovernorConfigSchema, GovernorConfigStore } from "../core/governor/config";

interface GovernorDeps {
  config: GovernorConfigStore;
}

export async function registerGovernorRoutes(app: FastifyInstance, deps: GovernorDeps): Promise<void> {
  app.get("/governor/config", async () => {
    return deps.config.getConfig();
  });

  app.put("/governor/config", async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    try {
      const parsed = GovernorConfigSchema.parse(request.body ?? {});
      const saved = deps.config.setConfig(parsed);
      return saved;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid governor config";
      return reply.status(400).send({ error: message });
    }
  });
}
