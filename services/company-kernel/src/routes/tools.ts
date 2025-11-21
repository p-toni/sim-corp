import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ToolCardSchema } from "@sim-corp/schemas";
import type { Registry } from "../core/registry";

interface ToolRouteDeps {
  registry: Registry;
}

export async function registerToolRoutes(app: FastifyInstance, deps: ToolRouteDeps): Promise<void> {
  const { registry } = deps;

  app.post("/tools", async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
    const parsed = ToolCardSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid tool", issues: parsed.error.issues });
    }

    registry.registerTool(parsed.data);
    return parsed.data;
  });

  app.get("/tools", async () => registry.listTools());

  app.get<{ Params: { id: string } }>(
    "/tools/:id",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tool = registry.getTool(request.params.id);
      if (!tool) {
        return reply.status(404).send({ error: "Tool not found" });
      }
      return tool;
    }
  );
}
