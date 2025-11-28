import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { analyzeSession } from "../core/analyze";
import {
  fetchSession,
  fetchSessionEvents,
  fetchSessionTelemetry
} from "../lib/ingestion-client";

export function registerAnalyzeRoute(app: FastifyInstance): void {
  app.get(
    "/analysis/session/:sessionId",
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      try {
        const [session, telemetry, events] = await Promise.all([
          fetchSession(sessionId),
          fetchSessionTelemetry(sessionId),
          fetchSessionEvents(sessionId)
        ]);
        const analysis = analyzeSession({
          sessionId,
          orgId: session.orgId,
          siteId: session.siteId,
          machineId: session.machineId,
          telemetry,
          events
        });
        return analysis;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return reply.status(400).send({ error: message });
      }
    }
  );
}
