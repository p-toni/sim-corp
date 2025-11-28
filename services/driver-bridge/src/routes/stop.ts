import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { DriverBridge } from "../core/bridge";

const StopSchema = z.object({
  sessionId: z.string()
});

interface StopDeps {
  bridge: DriverBridge;
}

export function registerStopRoute(app: FastifyInstance, deps: StopDeps): void {
  const { bridge } = deps;

  app.post(
    "/bridge/stop",
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const parsed = StopSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid stop request" });
      }

      const stopped = await bridge.stop(parsed.data.sessionId);
      if (!stopped) {
        return reply.status(404).send({ error: "Session not found" });
      }

      return { stopped: true };
    }
  );
}
