import type { FastifyInstance } from "fastify";
import type { InferenceEngine } from "../core/engine";

interface StatusDeps {
  engine: InferenceEngine;
}

export function registerStatusRoute(app: FastifyInstance, deps: StatusDeps): void {
  app.get("/status", () => deps.engine.getStatus());
}
