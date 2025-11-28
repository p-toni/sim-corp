import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { analyzeSession } from "../core/analyze";
import {
  fetchEventOverrides,
  fetchSession,
  fetchSessionEvents,
  fetchSessionMeta,
  fetchSessionTelemetry
} from "../lib/ingestion-client";

export function registerAnalyzeRoute(app: FastifyInstance): void {
  app.get(
    "/analysis/session/:sessionId",
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const { sessionId } = request.params;
      try {
        const [session, telemetry, events, meta, overrides] = await Promise.all([
          fetchSession(sessionId),
          fetchSessionTelemetry(sessionId),
          fetchSessionEvents(sessionId),
          fetchSessionMeta(sessionId),
          fetchEventOverrides(sessionId)
        ]);
        const analysis = analyzeSession({
          sessionId,
          orgId: session.orgId,
          siteId: session.siteId,
          machineId: session.machineId,
          telemetry,
          events,
          meta: meta ?? undefined,
          overrides
        });
        return analysis;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return reply.status(400).send({ error: message });
      }
    }
  );
}
