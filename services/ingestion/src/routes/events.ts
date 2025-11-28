import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { EventStore } from "../core/store";

interface EventRouteDeps {
  eventStore: EventStore;
}

interface EventQuerystring {
  orgId?: string;
  siteId?: string;
  machineId?: string;
  limit?: string | number;
}

export function registerEventRoutes(app: FastifyInstance, deps: EventRouteDeps): void {
  const { eventStore } = deps;

  app.get(
    "/events",
    (request: FastifyRequest<{ Querystring: EventQuerystring }>, reply: FastifyReply) => {
      const { limit, ...filters } = request.query;
      const parsedLimit = parseLimit(limit);
      if (parsedLimit === "INVALID") {
        return reply.status(400).send({ error: "Invalid limit" });
      }

      return eventStore.query({ ...filters, limit: parsedLimit ?? undefined });
    }
  );
}

function parseLimit(limit: string | number | undefined): number | undefined | "INVALID" {
  if (typeof limit === "undefined") {
    return undefined;
  }
  const numeric = typeof limit === "number" ? limit : Number(limit);
  if (Number.isNaN(numeric) || numeric < 0) {
    return "INVALID";
  }
  return numeric;
}
