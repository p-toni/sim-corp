import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  EventOverrideSchema,
  SessionMetaSchema,
  SessionNoteSchema,
  type EventOverride,
  type SessionNote
} from "@sim-corp/schemas";
import type { IngestionRepository } from "../db/repo";

interface SessionsQcDeps {
  repo: IngestionRepository;
}

export function registerSessionQcRoutes(app: FastifyInstance, deps: SessionsQcDeps): void {
  const { repo } = deps;

  app.get(
    "/sessions/:id/meta",
    (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const session = repo.getSession(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      return repo.getSessionMeta(request.params.id) ?? SessionMetaSchema.parse({});
    }
  );

  app.put(
    "/sessions/:id/meta",
    (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
      const session = repo.getSession(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      const meta = SessionMetaSchema.parse(request.body ?? {});
      const stored = repo.upsertSessionMeta(request.params.id, meta);
      return stored;
    }
  );

  app.get(
    "/sessions/:id/notes",
    (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { limit?: number | string; offset?: number | string };
      }>,
      reply: FastifyReply
    ) => {
      const session = repo.getSession(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      const limit = toNumber(request.query.limit, 50);
      const offset = toNumber(request.query.offset, 0);
      return repo.listSessionNotes(request.params.id, limit, offset);
    }
  );

  app.post(
    "/sessions/:id/notes",
    (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
      const session = repo.getSession(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      const payload = request.body ?? {};
      const baseSchema = SessionNoteSchema.omit({ noteId: true, createdAt: true }).partial({
        author: true
      });
      const parsed = baseSchema.parse(payload);
      const note: SessionNote = repo.addSessionNote(request.params.id, parsed);
      reply.status(201);
      return note;
    }
  );

  app.get(
    "/sessions/:id/events/overrides",
    (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const session = repo.getSession(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      return repo.getEventOverrides(request.params.id);
    }
  );

  app.put(
    "/sessions/:id/events/overrides",
    (request: FastifyRequest<{ Params: { id: string }; Body: unknown }>, reply: FastifyReply) => {
      const session = repo.getSession(request.params.id);
      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }
      const body = (request.body as { overrides?: unknown }) ?? {};
      const overridesInput = (body.overrides ?? body) as unknown;
      const parsedOverrides = EventOverrideSchema.array().parse(overridesInput).map((o) => ({
        ...o,
        updatedAt: o.updatedAt ?? new Date().toISOString()
      }));
      const maxElapsed = resolveMaxElapsedSeconds(repo, session.sessionId, session.dropSeconds);
      if (maxElapsed !== null) {
        for (const override of parsedOverrides) {
          if (override.elapsedSeconds < 0 || override.elapsedSeconds > maxElapsed) {
            return reply
              .status(400)
              .send({ error: `elapsedSeconds must be between 0 and ${maxElapsed}` });
          }
        }
      }
      const stored = repo.upsertEventOverrides(request.params.id, parsedOverrides as EventOverride[]);
      return stored;
    }
  );
}

function toNumber(value: string | number | undefined, defaultValue: number): number {
  if (typeof value === "undefined") return defaultValue;
  const numeric = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(numeric)) return defaultValue;
  return numeric;
}

function resolveMaxElapsedSeconds(
  repo: IngestionRepository,
  sessionId: string,
  dropSeconds?: number
): number | null {
  if (typeof dropSeconds === "number") return dropSeconds;
  return repo.getLastTelemetryElapsed(sessionId);
}
