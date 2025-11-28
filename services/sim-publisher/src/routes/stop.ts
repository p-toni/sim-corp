import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { SimPublisherManager } from "../core/publish";

const StopSchema = z.object({
  sessionId: z.string()
});

interface StopDeps {
  manager: SimPublisherManager;
}

export function registerStopRoute(app: FastifyInstance, deps: StopDeps): void {
  const { manager } = deps;

  app.post(
    "/publish/stop",
    (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const parsed = StopSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid stop request" });
      }

      const stopped = manager.stop(parsed.data.sessionId);
      if (!stopped) {
        return reply.status(404).send({ error: "Session not found" });
      }

      return { stopped: true };
    }
  );
}
