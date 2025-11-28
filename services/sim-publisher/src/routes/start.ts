import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { SimRoastRequestSchema } from "@sim-corp/sim-twin";
import type { SimPublisherManager } from "../core/publish";
import type { PublishRequest } from "../core/types";

const PublishRequestSchema = SimRoastRequestSchema.extend({
  orgId: z.string(),
  siteId: z.string(),
  machineId: z.string()
});

interface StartDeps {
  manager: SimPublisherManager;
}

export function registerStartRoute(app: FastifyInstance, deps: StartDeps): void {
  const { manager } = deps;

  app.post(
    "/publish/start",
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const parsed = PublishRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid publish request", issues: parsed.error.issues });
      }

      const session = await manager.start(parsed.data as PublishRequest);
      return {
        sessionId: session.id,
        stats: session.stats
      };
    }
  );
}
