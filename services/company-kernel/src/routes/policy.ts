import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { PolicyCheckRequestSchema } from "@sim-corp/schemas";
import type { PolicyEngine } from "../core/policy";

interface PolicyRouteDeps {
  policy: PolicyEngine;
}

export async function registerPolicyRoutes(app: FastifyInstance, deps: PolicyRouteDeps): Promise<void> {
  const { policy } = deps;

  app.post(
    "/policy/check",
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const parsed = PolicyCheckRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid policy request", issues: parsed.error.issues });
      }

      const result = await policy.check(parsed.data);
      return result;
    }
  );
}
