import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { simulateRoast } from "../core/model";
import { SimRoastRequestSchema } from "../core/types";

interface SimulateRoastRoute {
  Body: unknown;
}

export function registerSimulateRoutes(app: FastifyInstance): void {
  app.post<SimulateRoastRoute>("/simulate/roast", (request, reply) => {
    return handleSimulateRoast(request, reply);
  });
}

async function handleSimulateRoast(
  request: FastifyRequest<SimulateRoastRoute>,
  reply: FastifyReply
): Promise<void> {
  const parsed = SimRoastRequestSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    await reply.status(400).send({
      message: "Invalid roast simulation request",
      issues: parsed.error.issues
    });
    return;
  }

  const result = simulateRoast(parsed.data);
  await reply.status(200).send(result);
}
