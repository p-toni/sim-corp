import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import { registerAnalyzeRoute } from "./routes/analyze-session";
import { registerPredictionRoute } from "./routes/prediction-session";
import { initializeMetrics, metricsHandler, Registry as PrometheusRegistry } from "@sim-corp/metrics";
import { setupHealthAndShutdown } from "@sim-corp/health";
import { RateLimitFactory, FastifyRateLimitPlugin } from "@sim-corp/rate-limit";

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

  // Setup rate limiting (skip health and metrics endpoints)
  const { rateLimiter, strategy } = RateLimitFactory.getInstance();
  const rateLimitPlugin = new FastifyRateLimitPlugin(rateLimiter, strategy);

  app.addHook('preHandler', async (request, reply) => {
    // Skip rate limiting for health checks and metrics
    if (request.url === '/health' || request.url === '/metrics' || request.url === '/_rate-limit/metrics') {
      return;
    }
    await rateLimitPlugin.createHook()(request, reply);
  });

  // Setup health checks and graceful shutdown
  setupHealthAndShutdown(app, {
    serviceName: 'analytics',
    includeSystemMetrics: true,
  }, {
    timeout: 10000,
    logger: app.log,
  });
  registerAnalyzeRoute(app);
  registerPredictionRoute(app);

  // Prometheus metrics endpoint
  app.get('/metrics', async (_, reply) => {
    const metrics = await metricsHandler(metricsRegistry);
    reply.header('Content-Type', 'text/plain; version=0.0.4');
    return metrics;
  });

  // Rate limit metrics endpoint
  app.get('/_rate-limit/metrics', async () => {
    return rateLimiter.getMetrics();
  });

  return app;
}
