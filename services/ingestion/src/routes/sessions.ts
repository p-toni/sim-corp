import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { IngestionRepository, SessionFilters } from "../db/repo";

interface SessionsDeps {
  repo: IngestionRepository;
}

interface SessionQuery extends SessionFilters {
  limit?: string | number;
  offset?: string | number;
}

export function registerSessionRoutes(app: FastifyInstance, deps: SessionsDeps): void {
  const { repo } = deps;

  app.get("/sessions", (request: FastifyRequest<{ Querystring: SessionQuery }>) => {
    const { limit, offset, ...filters } = request.query;
    const parsedFilters: SessionFilters = {
      ...filters,
      limit: toNumber(limit, 50),
      offset: toNumber(offset, 0)
    };
    return repo.listSessions(parsedFilters);
  });

  app.get("/sessions/:id", (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const session = repo.getSession(request.params.id);
    if (!session) {
      return reply.status(404).send({ error: "Session not found" });
    }
    return session;
  });

  app.get(
    "/sessions/:id/telemetry",
    (request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: string | number; fromElapsedSeconds?: string | number; toElapsedSeconds?: string | number } }>) => {
      const { limit, fromElapsedSeconds, toElapsedSeconds } = request.query;
      const telemetry = repo.getTelemetry(
        request.params.id,
        toNumber(limit, 2000),
        toNumber(fromElapsedSeconds),
        toNumber(toElapsedSeconds)
      );
      return telemetry;
    }
  );

  app.get("/sessions/:id/events", (request: FastifyRequest<{ Params: { id: string } }>) => {
    return repo.getEvents(request.params.id);
  });
}

function toNumber(value: string | number | undefined, defaultValue?: number): number | undefined {
  if (typeof value === "undefined") return defaultValue;
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return defaultValue;
  return numeric;
}
