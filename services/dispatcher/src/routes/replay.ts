import type { FastifyInstance } from "fastify";
import { SessionClosedEventSchema } from "@sim-corp/schemas";
import type { Dispatcher } from "../core/dispatcher";

export async function registerReplayRoutes(app: FastifyInstance, dispatcher: Dispatcher): Promise<void> {
  app.post("/replay", async (request, reply) => {
    const parsed = SessionClosedEventSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid payload", issues: parsed.error.issues });
    }
    await dispatcher.processEvent(parsed.data);
    return reply.code(202).send({ status: "queued" });
  });
}
