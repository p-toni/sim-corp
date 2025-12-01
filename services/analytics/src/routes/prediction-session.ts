import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { computeRoastPrediction } from "../core/prediction";
import { fetchProfile, fetchSessionEvents, fetchSessionTelemetry } from "../lib/ingestion-client";

interface PredictionQuery {
  orgId?: string;
  profileId?: string;
}

export function registerPredictionRoute(app: FastifyInstance): void {
  app.get(
    "/prediction/session/:sessionId",
    async (
      request: FastifyRequest<{ Params: { sessionId: string }; Querystring: PredictionQuery }>,
      reply: FastifyReply
    ) => {
      const { sessionId } = request.params;
      const { orgId, profileId } = request.query;

      if (profileId && !orgId) {
        return reply.status(400).send({ error: "orgId is required when requesting profile-anchored prediction" });
      }

      try {
        const [telemetry, events, profile] = await Promise.all([
          fetchSessionTelemetry(sessionId),
          fetchSessionEvents(sessionId),
          profileId && orgId ? fetchProfile(orgId, profileId) : Promise.resolve(undefined)
        ]);

        const prediction = computeRoastPrediction({ sessionId, telemetry, events, profile: profile ?? undefined });
        return prediction;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return reply.status(400).send({ error: message });
      }
    }
  );
}
