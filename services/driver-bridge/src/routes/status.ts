import type { FastifyInstance } from "fastify";
import type { DriverBridge } from "../core/bridge";

interface StatusDeps {
  bridge: DriverBridge;
}

export function registerStatusRoute(app: FastifyInstance, deps: StatusDeps): void {
  const { bridge } = deps;

  app.get("/bridge/status", () => {
    return bridge.list().map((session) => ({
      id: session.id,
      config: session.config,
      stats: session.stats,
      driverStatus: typeof (session.driver as { getStatus?: () => unknown }).getStatus === "function"
        ? (session.driver as { getStatus: () => unknown }).getStatus()
        : undefined
    }));
  });
}
