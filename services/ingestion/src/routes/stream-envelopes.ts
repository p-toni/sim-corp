import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { EnvelopeStream } from "../core/envelope-stream";
import type { TelemetryQuery } from "../core/store";
import { formatSse } from "./stream";

interface StreamDeps {
  envelopeStream: EnvelopeStream;
}

type EnvelopeQuery = TelemetryQuery;

export function registerEnvelopeStreamRoutes(app: FastifyInstance, deps: StreamDeps): void {
  const { envelopeStream } = deps;

  app.get("/stream/envelopes/telemetry", (request: FastifyRequest<{ Querystring: EnvelopeQuery }>, reply: FastifyReply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    const unsubscribe = envelopeStream.subscribeTelemetry(request.query, (env) => {
      reply.raw.write(formatSse("telemetry", env));
    });
    request.raw.on("close", () => {
      unsubscribe();
      reply.raw.end();
    });
  });

  app.get("/stream/envelopes/events", (request: FastifyRequest<{ Querystring: EnvelopeQuery }>, reply: FastifyReply) => {
    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    });
    const unsubscribe = envelopeStream.subscribeEvents(request.query, (env) => {
      reply.raw.write(formatSse("roastEvent", env));
    });
    request.raw.on("close", () => {
      unsubscribe();
      reply.raw.end();
    });
  });
}
