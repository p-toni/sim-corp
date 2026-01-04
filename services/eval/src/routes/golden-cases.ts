import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { EvalService } from "../core/eval-service";
import { GoldenCaseSchema } from "@sim-corp/schemas";

interface GoldenCasesDeps {
  evalService: EvalService;
}

interface GoldenCasesQuery {
  machineId?: string;
  archived?: string;
}

export function registerGoldenCaseRoutes(app: FastifyInstance, deps: GoldenCasesDeps): void {
  const { evalService } = deps;

  // List golden cases
  app.get("/golden-cases", (request: FastifyRequest<{ Querystring: GoldenCasesQuery }>) => {
    const { machineId, archived } = request.query;
    return evalService.listGoldenCases({
      machineId,
      archived: archived === "true"
    });
  });

  // Get golden case by ID
  app.get(
    "/golden-cases/:id",
    (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const goldenCase = evalService.getGoldenCase(request.params.id);
      if (!goldenCase) {
        return reply.status(404).send({ error: "Golden case not found" });
      }
      return goldenCase;
    }
  );

  // Create golden case
  app.post("/golden-cases", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = GoldenCaseSchema.omit({ id: true }).parse(request.body);
      const created = evalService.createGoldenCase(parsed);
      return reply.status(201).send(created);
    } catch (err) {
      return reply.status(400).send({ error: "Invalid golden case data", details: err });
    }
  });
}
