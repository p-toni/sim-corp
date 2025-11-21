import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { TelemetryStore } from "../core/store";

interface TelemetryRouteDeps {
  telemetryStore: TelemetryStore;
}

interface TelemetryQuerystring {
  orgId?: string;
  siteId?: string;
  machineId?: string;
  limit?: string | number;
}

export async function registerTelemetryRoutes(
  app: FastifyInstance,
  deps: TelemetryRouteDeps
): Promise<void> {
  const { telemetryStore } = deps;

  app.get(
    "/telemetry",
    async (request: FastifyRequest<{ Querystring: TelemetryQuerystring }>, reply: FastifyReply) => {
      const { limit, ...filters } = request.query;
      const parsedLimit = parseLimit(limit);
      if (parsedLimit === "INVALID") {
        return reply.status(400).send({ error: "Invalid limit" });
      }

      return telemetryStore.query({ ...filters, limit: parsedLimit ?? undefined });
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
