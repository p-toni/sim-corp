import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AgentCardSchema } from "@sim-corp/schemas";
import type { Registry } from "../core/registry";

interface AgentRouteDeps {
  registry: Registry;
}

export async function registerAgentRoutes(app: FastifyInstance, deps: AgentRouteDeps): Promise<void> {
  const { registry } = deps;

  app.post("/agents", async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    const parsed = AgentCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid agent", issues: parsed.error.issues });
    }

    registry.registerAgent(parsed.data);
    return parsed.data;
  });

  app.get("/agents", async () => registry.listAgents());

  app.get<{ Params: { id: string } }>(
    "/agents/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const agent = registry.getAgent(request.params.id);
      if (!agent) {
        return reply.status(404).send({ error: "Agent not found" });
      }
      return agent;
    }
  );
}
