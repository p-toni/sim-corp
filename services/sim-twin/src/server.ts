import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerHealthRoutes } from "./routes/health";
import { registerSimulateRoutes } from "./routes/simulate";

export interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  registerHealthRoutes(app);
  registerSimulateRoutes(app);

  return app;
}
