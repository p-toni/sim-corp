import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { EventQuery, EventStore, TelemetryQuery, TelemetryStore } from "../core/store";

interface StreamDeps {
  telemetryStore: TelemetryStore;
  eventStore: EventStore;
}

interface StreamQuery extends TelemetryQuery {}

function setSseHeaders(reply: FastifyReply): void {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  reply.raw.flushHeaders?.();
}

export function formatSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function registerStreamRoutes(app: FastifyInstance, deps: StreamDeps): void {
  const { telemetryStore, eventStore } = deps;

  app.get(
    "/stream/telemetry",
    (request: FastifyRequest<{ Querystring: StreamQuery }>, reply: FastifyReply) => {
      reply.hijack();
      setSseHeaders(reply);
      const unsubscribe = telemetryStore.subscribe(request.query, (point) => {
        reply.raw.write(formatSse("telemetry", point));
      });

      const close = (): void => {
        unsubscribe();
        reply.raw.end();
      };

      request.raw.on("close", close);
    }
  );

  app.get("/stream/events", (request: FastifyRequest<{ Querystring: EventQuery }>, reply: FastifyReply) => {
    reply.hijack();
    setSseHeaders(reply);

    const unsubscribe = eventStore.subscribe(request.query, (event) => {
      reply.raw.write(formatSse("roastEvent", event));
    });

    const close = (): void => {
      unsubscribe();
      reply.raw.end();
    };

    request.raw.on("close", close);
  });
}
