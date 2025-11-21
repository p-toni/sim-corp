import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AgentTraceSchema } from "@sim-corp/schemas";
import type { TraceStore } from "../core/traces";

interface TraceRouteDeps {
  traces: TraceStore;
}

type TracePostRequest = FastifyRequest<{ Body: unknown }>;
type TraceListRequest = FastifyRequest<{ Querystring: { limit?: string | number } }>;
type TraceGetRequest = FastifyRequest<{ Params: { missionId: string } }>;

export async function registerTraceRoutes(app: FastifyInstance, deps: TraceRouteDeps): Promise<void> {
  const { traces } = deps;

  app.post("/traces", async (request: TracePostRequest, reply: FastifyReply) => {
    const parsed = AgentTraceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid trace", issues: parsed.error.issues });
    }

    traces.save(parsed.data);
    return { ok: true };
  });

  app.get("/traces", async (request: TraceListRequest, reply: FastifyReply) => {
    const limitValue = request.query.limit;
    let limit: number | undefined;
    if (typeof limitValue !== "undefined") {
      const numeric = typeof limitValue === "number" ? limitValue : Number(limitValue);
      if (Number.isNaN(numeric) || numeric < 0) {
        return reply.status(400).send({ error: "Invalid limit" });
      }
      limit = numeric;
    }

    return traces.list(limit);
  });

  app.get("/traces/:missionId", async (request: TraceGetRequest, reply: FastifyReply) => {
    const trace = traces.getByMissionId(request.params.missionId);
    if (!trace) {
      return reply.status(404).send({ error: "Trace not found" });
    }
    return trace;
  });
}
