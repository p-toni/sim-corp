import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerHealthRoute } from "./routes/health";
import { registerAnalyzeRoute } from "./routes/analyze-session";
import { registerPredictionRoute } from "./routes/prediction-session";
import { initializeMetrics, metricsHandler, Registry as PrometheusRegistry } from "@sim-corp/metrics";

interface BuildOptions {
  logger?: FastifyServerOptions["logger"];
}

export async function buildServer(options: BuildOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });
  // Initialize Prometheus metrics
  const metricsRegistry = new PrometheusRegistry();
  const httpMetrics = initializeMetrics({
    serviceName: 'analytics',
    collectDefaultMetrics: true,
    prefix: 'simcorp',
    registry: metricsRegistry,
  });

  // Add HTTP metrics middleware
  app.addHook('onRequest', httpMetrics.middleware('analytics'));

  registerHealthRoute(app);
  registerAnalyzeRoute(app);
  registerPredictionRoute(app);

  // Prometheus metrics endpoint
  app.get('/metrics', async (_, reply) => {
    const metrics = await metricsHandler(metricsRegistry);
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics;
  });

  return app;
}
