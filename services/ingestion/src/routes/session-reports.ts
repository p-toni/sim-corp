import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RoastReport } from "@sim-corp/schemas";
import type { IngestionRepository } from "../db/repo";
import { ensureOrgAccess } from "../auth";

interface SessionReportDeps {
  repo: IngestionRepository;
}

export function registerSessionReportRoutes(app: FastifyInstance, deps: SessionReportDeps): void {
  const { repo } = deps;

  app.get(
    "/sessions/:sessionId/reports",
    (
      request: FastifyRequest<{
        Params: { sessionId: string };
        Querystring: { limit?: number | string; offset?: number | string };
      }>,
      reply: FastifyReply
    ) => {
      const session = repo.getSession(request.params.sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      if (!ensureOrgAccess(reply, request.actor, session.orgId)) return;
      const limit = toNumber(request.query.limit, 20);
      const offset = toNumber(request.query.offset, 0);
      return repo.listSessionReports(session.sessionId, limit, offset);
    }
  );

  app.get(
    "/sessions/:sessionId/reports/latest",
    (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const session = repo.getSession(request.params.sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      if (!ensureOrgAccess(reply, request.actor, session.orgId)) return;
      const report = repo.getLatestSessionReport(session.sessionId);
      if (!report) {
        return reply.status(404).send({ error: "Report not found" });
      }
      return report;
    }
  );

  app.get("/reports/:reportId", (request: FastifyRequest<{ Params: { reportId: string } }>, reply: FastifyReply) => {
    const report = repo.getSessionReportById(request.params.reportId);
    if (!report) {
      return reply.status(404).send({ error: "Report not found" });
    }
    if (!ensureOrgAccess(reply, request.actor, report.orgId)) return;
    return report;
  });

  app.post(
    "/sessions/:sessionId/reports",
    (request: FastifyRequest<{ Params: { sessionId: string }; Body: unknown }>, reply: FastifyReply) => {
      const session = repo.getSession(request.params.sessionId);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      if (!ensureOrgAccess(reply, request.actor, session.orgId)) return;

      const body = (request.body ?? {}) as Record<string, unknown>;
      const { traceId, ...payload } = body;
      try {
        const reportInput = {
          ...(payload as object),
          sessionId: session.sessionId,
          orgId: session.orgId,
          siteId: session.siteId,
          machineId: session.machineId
        };
        const { report, created } = repo.createSessionReport(
          session.sessionId,
          reportInput as RoastReport,
          typeof traceId === "string" ? traceId : undefined,
          request.actor
        );
        reply.status(created ? 201 : 200);
        return report;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid report";
        return reply.status(400).send({ error: message });
      }
    }
  );
}

function toNumber(value: string | number | undefined, defaultValue: number): number {
  if (typeof value === "undefined") return defaultValue;
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return defaultValue;
  return numeric;
}
