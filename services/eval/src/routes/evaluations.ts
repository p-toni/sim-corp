import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { EvalService } from "../core/eval-service";
import { z } from "zod";
import { RoastAnalysisSchema, TelemetryPointSchema } from "@sim-corp/schemas";

interface EvaluationsDeps {
  evalService: EvalService;
}

interface EvaluationsQuery {
  sessionId?: string;
  goldenCaseId?: string;
}

const RunEvaluationSchema = z.object({
  sessionId: z.string(),
  goldenCaseId: z.string(),
  analysis: RoastAnalysisSchema,
  telemetry: z.array(TelemetryPointSchema).optional(),
  orgId: z.string().optional(),
  evaluatorId: z.string().optional()
});

export function registerEvaluationRoutes(app: FastifyInstance, deps: EvaluationsDeps): void {
  const { evalService } = deps;

  // List evaluations
  app.get("/evaluations", (request: FastifyRequest<{ Querystring: EvaluationsQuery }>) => {
    const { sessionId, goldenCaseId } = request.query;

    if (sessionId) {
      return evalService.getSessionEvaluations(sessionId);
    }

    if (goldenCaseId) {
      return evalService.getGoldenCaseEvaluations(goldenCaseId);
    }

    return { error: "Either sessionId or goldenCaseId query parameter is required" };
  });

  // Run evaluation
  app.post("/evaluations/run", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const input = RunEvaluationSchema.parse(request.body);
      const evalRun = await evalService.runEvaluation(input);
      return reply.status(201).send(evalRun);
    } catch (err) {
      if (err instanceof Error) {
        return reply.status(400).send({ error: err.message });
      }
      return reply.status(400).send({ error: "Invalid evaluation input", details: err });
    }
  });

  // Check promotion eligibility
  app.get(
    "/evaluations/promotion/:sessionId",
    (request: FastifyRequest<{ Params: { sessionId: string } }>) => {
      return evalService.canPromote(request.params.sessionId);
    }
  );

  // T-028.2 Phase 3: Get saturation metrics for a specific golden case
  app.get(
    "/saturation/golden-cases/:id",
    (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const metrics = evalService.calculateSaturationMetrics(request.params.id);
      if (!metrics) {
        return reply.status(404).send({ error: "Golden case not found" });
      }
      return metrics;
    }
  );

  // T-028.2 Phase 3: Get saturation summary across all golden cases
  app.get("/saturation/summary", () => {
    return evalService.calculateSaturationSummary();
  });

  // T-028.2 Phase 3: Get list of all golden case saturation metrics
  app.get("/saturation/golden-cases", () => {
    const allGoldenCases = evalService.listGoldenCases({ archived: false });
    return allGoldenCases
      .map(gc => evalService.calculateSaturationMetrics(gc.id))
      .filter(m => m !== null);
  });
}
