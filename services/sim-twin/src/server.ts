import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerHealthRoutes } from "./routes/health";
import { registerSimulateRoutes } from "./routes/simulate";
import { initializeMetrics, metricsHandler, Registry as PrometheusRegistry } from "@sim-corp/metrics";
import { setupHealthAndShutdown } from "@sim-corp/health";

export interface BuildServerOptions {
  logger?: FastifyServerOptions["logger"];
  enableGracefulShutdown?: boolean;
}

export async function buildServer(options: BuildServerOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  // Initialize Prometheus metrics
  const metricsRegistry = new PrometheusRegistry();
  const httpMetrics = initializeMetrics({
    serviceName: 'sim-twin',
    collectDefaultMetrics: true,
    prefix: 'simcorp',
    registry: metricsRegistry,
  });

  // Add HTTP metrics middleware
  app.addHook('onRequest', httpMetrics.middleware('sim-twin'));

  // Setup health checks and graceful shutdown
  setupHealthAndShutdown(app, {
    serviceName: 'sim-twin',
    includeSystemMetrics: true,
  }, options.enableGracefulShutdown !== false ? {
    timeout: 10000,
    logger: app.log,
  } : undefined);

  registerSimulateRoutes(app);

  // Prometheus metrics endpoint
  app.get('/metrics', async (_, reply) => {
    const metrics = await metricsHandler(metricsRegistry);
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics;
  });

  return app;
}
