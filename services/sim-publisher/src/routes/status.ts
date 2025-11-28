import type { FastifyInstance } from "fastify";
import type { SimPublisherManager } from "../core/publish";

interface StatusDeps {
  manager: SimPublisherManager;
}

export function registerStatusRoute(app: FastifyInstance, deps: StatusDeps): void {
  const { manager } = deps;

  app.get("/publish/status", () => {
    return manager.listSessions().map((session) => ({
      id: session.id,
      stats: session.stats,
      request: session.request
    }));
  });
}
