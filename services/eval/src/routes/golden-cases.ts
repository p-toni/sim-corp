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

  // T-028.2 Phase 2: Create golden case from successful session
  app.post(
    "/golden-cases/from-success",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as any;
        const created = evalService.createGoldenCaseFromSuccess(body);
        return reply.status(201).send(created);
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to create golden case from success",
          details: err,
        });
      }
    }
  );

  // T-028.2 Phase 2: Create golden case from failed session
  app.post(
    "/golden-cases/from-failure",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as any;
        const created = evalService.createGoldenCaseFromFailure(body);
        return reply.status(201).send(created);
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to create golden case from failure",
          details: err,
        });
      }
    }
  );

  // T-028.2 Phase 2: Attach reference solution to existing golden case
  app.post(
    "/golden-cases/:id/reference-solution",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          sessionId: string;
          roasterName?: string;
          achievedAt: string;
          notes?: string;
          expertReviewed?: boolean;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const updated = evalService.attachReferenceSolution(
          request.params.id,
          request.body
        );
        if (!updated) {
          return reply.status(404).send({ error: "Golden case not found" });
        }
        return updated;
      } catch (err) {
        return reply.status(400).send({
          error: "Failed to attach reference solution",
          details: err,
        });
      }
    }
  );
}
